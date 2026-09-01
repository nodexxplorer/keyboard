const SILENCE_RMS = 0.01;
const MIN_FREQ = 60;
const MAX_FREQ = 1500;

class PitchProcessor extends AudioWorkletProcessor {
  constructor(){
    super();
    this.bufferSize = 2048;
    this.hopSize = 1024; // batches YIN to ~43Hz @44.1kHz so it stays inside the audio thread's timing budget
    this.ring = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.filled = false;
    this.samplesSinceHop = 0;
  }

  rms(buf){
    let sum = 0;
    for(let i=0;i<buf.length;i++) sum += buf[i]*buf[i];
    return Math.sqrt(sum/buf.length);
  }

  orderedBuffer(){
    const out = new Float32Array(this.bufferSize);
    out.set(this.ring.subarray(this.writeIndex));
    out.set(this.ring.subarray(0, this.writeIndex), this.bufferSize - this.writeIndex);
    return out;
  }

  // ---- YIN pitch detection (same algorithm as the prior main-thread version) ----
  detectPitchYIN(buf, sr){
    const threshold = 0.15;
    const yinBuffer = new Float32Array(buf.length / 2);
    let runningSum = 0;

    yinBuffer[0] = 1;
    for(let tau = 1; tau < yinBuffer.length; tau++){
      let sum = 0;
      for(let i = 0; i < yinBuffer.length; i++){
        const d = buf[i] - buf[i+tau];
        sum += d*d;
      }
      runningSum += sum;
      yinBuffer[tau] = runningSum === 0 ? 1 : sum * tau / runningSum;
    }

    let tauEstimate = -1;
    for(let tau = 2; tau < yinBuffer.length; tau++){
      if(yinBuffer[tau] < threshold){
        while(tau+1 < yinBuffer.length && yinBuffer[tau+1] < yinBuffer[tau]) tau++;
        tauEstimate = tau;
        break;
      }
    }
    if(tauEstimate === -1) return null;

    let betterTau = tauEstimate;
    const x0 = tauEstimate < 1 ? tauEstimate : tauEstimate - 1;
    const x2 = tauEstimate + 1 < yinBuffer.length ? tauEstimate + 1 : tauEstimate;
    if(x0 !== tauEstimate && x2 !== tauEstimate){
      const s0 = yinBuffer[x0], s1 = yinBuffer[tauEstimate], s2 = yinBuffer[x2];
      const adjustment = (s2 - s0) / (2 * (2*s1 - s2 - s0));
      if(isFinite(adjustment)) betterTau = tauEstimate + adjustment;
    }
    return sr / betterTau;
  }

  process(inputs){
    const channel = inputs[0] && inputs[0][0];
    if(!channel || channel.length === 0) return true;

    for(let i = 0; i < channel.length; i++){
      this.ring[this.writeIndex] = channel[i];
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
      if(this.writeIndex === 0) this.filled = true;
      this.samplesSinceHop++;
    }

    if(this.filled && this.samplesSinceHop >= this.hopSize){
      this.samplesSinceHop = 0;
      const buf = this.orderedBuffer();
      const level = this.rms(buf);
      let freq = null;
      if(level >= SILENCE_RMS){
        const raw = this.detectPitchYIN(buf, sampleRate);
        if(raw && raw > MIN_FREQ && raw < MAX_FREQ) freq = raw;
      }
      this.port.postMessage({ level, freq });
    }
    return true;
  }
}

registerProcessor('pitch-processor', PitchProcessor);
