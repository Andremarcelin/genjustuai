class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / 16000;
    this.cursor = 0;
    this.buf = [];
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input || !input.length) return true;
    let index = this.cursor;
    while (index < input.length) {
      const i0 = Math.floor(index);
      const i1 = Math.min(i0 + 1, input.length - 1);
      const mix = index - i0;
      let sample = input[i0] * (1 - mix) + input[i1] * mix;
      sample = Math.max(-1, Math.min(1, sample));
      this.buf.push((sample < 0 ? sample * 0x8000 : sample * 0x7fff) | 0);
      index += this.step;
    }
    this.cursor = index - input.length;
    if (this.buf.length >= 1600) {
      const pcm = new Int16Array(this.buf);
      this.buf = [];
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCapture);
