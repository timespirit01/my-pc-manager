// ffmpeg 인코딩 작업. 브라우저가 보낸 JPEG 프레임을 순서대로 stdin에 넣어 H.264 MP4로 만든다.
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { rmSync } from 'node:fs';

export const FFMPEG_PATH: string = process.env.FFMPEG_PATH ?? ffmpegInstaller.path;
export const FFPROBE_PATH: string = process.env.FFPROBE_PATH ?? ffprobeInstaller.path;

const IDLE_TIMEOUT_MS = 90_000;

export class EncodeJob {
  readonly output: string;
  fileName = '';
  received = 0;
  onDone?: () => void;
  private proc: ChildProcessWithoutNullStreams;
  private stderr = '';
  private exit: Promise<number>;
  private failed: Error | null = null;
  private idle?: NodeJS.Timeout;
  private chain: Promise<void> = Promise.resolve();

  constructor(private opts: { width: number; height: number; fps: number; frameCount: number; output: string }) {
    this.output = opts.output;
    const args = [
      '-hide_banner', '-y',
      '-f', 'image2pipe', '-framerate', String(opts.fps), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-tune', 'animation',
      '-pix_fmt', 'yuv420p', '-r', String(opts.fps),
      '-vf', `scale=${opts.width}:${opts.height}:flags=lanczos`,
      '-movflags', '+faststart',
      '-frames:v', String(opts.frameCount),
      opts.output,
    ];
    this.proc = spawn(FFMPEG_PATH, args);
    this.proc.stderr.on('data', (d) => {
      this.stderr = (this.stderr + d.toString()).slice(-4000);
    });
    this.proc.stdin.on('error', (e) => {
      this.failed ??= new Error(`인코더 연결 오류: ${e.message}`);
    });
    this.exit = new Promise((res) => this.proc.on('close', (code) => res(code ?? -1)));
    this.touch();
  }

  private touch() {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => this.cancel('프레임 수신이 오래 멈춰 작업을 취소했습니다'), IDLE_TIMEOUT_MS);
  }

  /** 프레임 묶음을 순서대로 기록. start는 이 묶음의 첫 프레임 번호(중복/누락 검사) */
  writeFrames(start: number, frames: Buffer[]): Promise<void> {
    const run = async () => {
      if (this.failed) throw this.failed;
      if (start !== this.received) throw new Error(`프레임 순서가 맞지 않습니다(기대 ${this.received}, 받음 ${start})`);
      for (const f of frames) {
        if (!this.proc.stdin.write(f)) {
          await new Promise<void>((res, rej) => {
            const onDrain = () => { cleanup(); res(); };
            const onClose = () => { cleanup(); rej(new Error(`인코더가 종료되었습니다: ${this.tail()}`)); };
            const cleanup = () => { this.proc.stdin.off('drain', onDrain); this.proc.off('close', onClose); };
            this.proc.stdin.once('drain', onDrain);
            this.proc.once('close', onClose);
          });
        }
        this.received++;
      }
      this.touch();
    };
    const p = this.chain.then(run);
    this.chain = p.catch(() => undefined);
    return p;
  }

  async finish(): Promise<void> {
    await this.chain;
    clearTimeout(this.idle);
    if (this.failed) throw this.failed;
    if (this.received !== this.opts.frameCount) throw new Error(`프레임이 모자랍니다(${this.received}/${this.opts.frameCount})`);
    this.proc.stdin.end();
    const code = await this.exit;
    this.onDone?.();
    if (code !== 0) throw new Error(`인코딩 실패(코드 ${code}): ${this.tail()}`);
  }

  cancel(reason: string) {
    clearTimeout(this.idle);
    this.failed ??= new Error(reason);
    this.proc.kill('SIGKILL');
    rmSync(this.output, { force: true });
    this.onDone?.();
  }

  private tail() {
    return this.stderr.split('\n').filter(Boolean).slice(-3).join(' / ');
  }
}

export function probeVideo(file: string): Promise<{ width: number; height: number; duration: number; fps: number; codec: string; frames: number }> {
  return new Promise((resolve, reject) => {
    execFile(
      FFPROBE_PATH,
      ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=width,height,codec_name,r_frame_rate,nb_read_packets:format=duration', '-of', 'json', file],
      (err, stdout) => {
        if (err) return reject(new Error(`결과 확인 실패: ${err.message}`));
        const j = JSON.parse(stdout);
        const s = j.streams?.[0] ?? {};
        const [n, d] = String(s.r_frame_rate ?? '0/1').split('/').map(Number);
        resolve({
          width: s.width, height: s.height, codec: s.codec_name,
          fps: d ? n / d : 0, frames: Number(s.nb_read_packets ?? 0),
          duration: Number(j.format?.duration ?? 0),
        });
      },
    );
  });
}
