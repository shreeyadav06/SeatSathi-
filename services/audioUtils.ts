
export interface Blob {
  data: string;
  mimeType: string;
}

// Simple linear interpolation resampler
function resampleTo16k(audioData: Float32Array, sampleRate: number): Float32Array {
  if (sampleRate === 16000) return audioData;

  const ratio = sampleRate / 16000;
  const newLength = Math.ceil(audioData.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    
    // Check bounds
    if (index >= audioData.length - 1) {
        result[i] = audioData[index];
    } else {
        const a = audioData[index];
        const b = audioData[index + 1];
        result[i] = a + (b - a) * fraction;
    }
  }
  return result;
}

// More efficient base64 encoder that avoids large string concatenations
function fastEncode(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    // Process in chunks to avoid stack overflow with String.fromCharCode
    const CHUNK_SIZE = 8192; 
    
    for (let i = 0; i < len; i += CHUNK_SIZE) {
        const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, len));
        binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return btoa(binary);
}

export function createBlob(data: Float32Array, inputSampleRate: number): Blob {
  // Resample to 16kHz first
  const resampledData = resampleTo16k(data, inputSampleRate);

  const l = resampledData.length;
  const int16 = new Int16Array(l);
  
  for (let i = 0; i < l; i++) {
    // Basic PCM scaling with clamping
    const s = Math.max(-1, Math.min(1, resampledData[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  return {
    data: fastEncode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

export function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function decodeAudioDataSync(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): AudioBuffer {
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2));
  const frameCount = Math.floor(dataInt16.length / numChannels);
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  return decodeAudioDataSync(data, ctx, sampleRate, numChannels);
}

export function encode(bytes: Uint8Array) {
    return fastEncode(bytes);
}
