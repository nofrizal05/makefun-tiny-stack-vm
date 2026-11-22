// Tiny stack VM for make.fun's tiny-stack-vm-01 ISA (kit ISA.md).
// Reads /input/<id>/program.bin + input.bin, writes stdout.bin + exit.txt.
// Node 22, standard library only.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const IN_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const MAX_STEPS = 1_000_000;
const MAX_OUT = 65_536;

// Per-opcode shape [immediate bytes, pops, pushes]; missing = unknown (trap 5).
const IMM = new Uint8Array(256);
const POPN = new Uint8Array(256);
const PUSHN = new Uint8Array(256);
const KNOWN = new Uint8Array(256);
const shape = (op: number, imm: number, pops: number, pushes: number): void => {
  KNOWN[op] = 1; IMM[op] = imm; POPN[op] = pops; PUSHN[op] = pushes;
};
shape(0x00, 0, 0, 0);
shape(0x01, 1, 0, 1);
shape(0x02, 4, 0, 1);
shape(0x03, 0, 1, 0);
shape(0x04, 0, 1, 2);
shape(0x05, 0, 2, 2);
shape(0x06, 0, 2, 3);
shape(0x07, 0, 3, 3);
shape(0x10, 0, 2, 1);
shape(0x11, 0, 2, 1);
shape(0x12, 0, 2, 1);
shape(0x13, 0, 2, 1);
shape(0x14, 0, 2, 1);
shape(0x15, 0, 2, 1);
shape(0x16, 0, 2, 1);
shape(0x17, 0, 1, 1);
shape(0x18, 0, 2, 1);
shape(0x19, 0, 2, 1);
shape(0x1a, 0, 2, 1);
shape(0x1b, 0, 1, 1);
shape(0x1c, 0, 2, 1);
shape(0x1d, 0, 2, 1);
shape(0x1e, 0, 2, 1);
shape(0x20, 0, 2, 1);
shape(0x21, 0, 2, 1);
shape(0x22, 0, 2, 1);
shape(0x30, 2, 0, 0);
shape(0x31, 2, 1, 0);
shape(0x32, 2, 1, 0);
shape(0x33, 2, 0, 0);
shape(0x34, 0, 0, 0);
shape(0x40, 0, 1, 1);
shape(0x41, 0, 2, 0);
shape(0x50, 0, 1, 0);
shape(0x51, 0, 1, 0);
shape(0x52, 0, 0, 1);
shape(0x53, 0, 1, 0);

function run(prog: Uint8Array, input: Uint8Array): { out: Uint8Array; code: number } {
  const n = prog.length;
  const st = new Int32Array(256);
  const cs = new Int32Array(64);
  const mem = new Int32Array(256);
  const buf = new Uint8Array(MAX_OUT);
  let sp = 0, csp = 0, olen = 0, ipos = 0, pc = 0, steps = 0;
  const done = (code: number): { out: Uint8Array; code: number } => ({ out: buf.slice(0, olen), code });
  for (;;) {
    if (steps === MAX_STEPS) return done(10);
    if (pc < 0 || pc >= n) return done(9);
    const op = prog[pc];
    if (!KNOWN[op]) return done(5);
    const imm = IMM[op];
    const pops = POPN[op];
    const pushes = PUSHN[op];
    if (pc + imm >= n) return done(9);
    steps++;
    const next = pc + 1 + imm;
    if (sp < pops) return done(2);
    if (sp - pops + pushes > 256) return done(3);
    pc = next;
    switch (op) {
      case 0x00: return done(0);
      case 0x01: st[sp++] = (prog[next - 1] << 24) >> 24; break;
      case 0x02: st[sp++] = prog[next - 4] | (prog[next - 3] << 8) | (prog[next - 2] << 16) | (prog[next - 1] << 24); break;
      case 0x03: sp--; break;
      case 0x04: st[sp] = st[sp - 1]; sp++; break;
      case 0x05: { const t = st[sp - 1]; st[sp - 1] = st[sp - 2]; st[sp - 2] = t; break; }
      case 0x06: st[sp] = st[sp - 2]; sp++; break;
      case 0x07: { const a = st[sp - 3]; st[sp - 3] = st[sp - 2]; st[sp - 2] = st[sp - 1]; st[sp - 1] = a; break; }
      case 0x17: st[sp - 1] = -st[sp - 1] | 0; break;
      case 0x1b: st[sp - 1] = ~st[sp - 1]; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
      case 0x20: case 0x21: case 0x22: {
        const b = st[sp - 1];
        const a = st[sp - 2];
        let r: number;
        switch (op) {
          case 0x10: r = (a + b) | 0; break;
          case 0x11: r = (a - b) | 0; break;
          case 0x12: r = Math.imul(a, b); break;
          case 0x13:
            if (b === 0) return done(4);
            r = (a / b) | 0;
            break;
          case 0x14:
            if (b === 0) return done(4);
            r = (a % b) | 0;
            break;
          case 0x15:
            if (b === 0) return done(4);
            r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
            break;
          case 0x16:
            if (b === 0) return done(4);
            r = ((a >>> 0) % (b >>> 0)) | 0;
            break;
          case 0x18: r = a & b; break;
          case 0x19: r = a | b; break;
          case 0x1a: r = a ^ b; break;
          case 0x1c: r = a << (b & 31); break;
          case 0x1d: r = a >> (b & 31); break;
          case 0x1e: r = (a >>> (b & 31)) | 0; break;
          case 0x20: r = a === b ? 1 : 0; break;
          case 0x21: r = a < b ? 1 : 0; break;
          default: r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        }
        sp -= 2;
        st[sp] = r;
        sp++;
        break;
      }
      case 0x30: case 0x31: case 0x32: {
        const rel = ((prog[next - 2] | (prog[next - 1] << 8)) << 16) >> 16;
        let take = op === 0x30;
        if (op !== 0x30) {
          const v = st[--sp];
          take = op === 0x31 ? v === 0 : v !== 0;
        }
        if (take) pc = next + rel;
        break;
      }
      case 0x33:
        if (csp === 64) return done(7);
        cs[csp++] = next;
        pc = prog[next - 2] | (prog[next - 1] << 8);
        break;
      case 0x34:
        if (csp === 0) return done(8);
        pc = cs[--csp];
        break;
      case 0x40: {
        const addr = st[sp - 1];
        if (addr < 0 || addr > 255) return done(6);
        st[sp - 1] = mem[addr];
        break;
      }
      case 0x41: {
        const addr = st[sp - 1];
        const v = st[sp - 2];
        if (addr < 0 || addr > 255) return done(6);
        sp -= 2;
        mem[addr] = v;
        break;
      }
      case 0x50: {
        const s = String(st[sp - 1]);
        if (olen + s.length > MAX_OUT) return done(11);
        sp--;
        for (let i = 0; i < s.length; i++) buf[olen++] = s.charCodeAt(i);
        break;
      }
      case 0x51:
        if (olen + 1 > MAX_OUT) return done(11);
        buf[olen++] = st[--sp] & 255;
        break;
      case 0x52: st[sp++] = ipos < input.length ? input[ipos++] : -1; break;
      case 0x53: return done(st[--sp] & 255);
      default: return done(5);
    }
  }
}

for (const id of readdirSync(IN_DIR).sort()) {
  const r = run(readFileSync(join(IN_DIR, id, 'program.bin')), readFileSync(join(IN_DIR, id, 'input.bin')));
  mkdirSync(join(OUT_DIR, id), { recursive: true });
  writeFileSync(join(OUT_DIR, id, 'stdout.bin'), r.out);
  writeFileSync(join(OUT_DIR, id, 'exit.txt'), `${r.code}\n`);
}
