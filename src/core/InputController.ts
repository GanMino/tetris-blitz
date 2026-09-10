export type InputIntent =
  | 'move-left'
  | 'move-right'
  | 'soft-drop'
  | 'rotate-cw'
  | 'rotate-ccw'
  | 'hard-drop'
  | 'pause'
  | 'mute'
  | 'start'
  | 'restart';

type Direction = 'left' | 'right' | 'down';

const KEY_MAP: Record<string, InputIntent> = {
  ArrowLeft: 'move-left',
  ArrowRight: 'move-right',
  ArrowDown: 'soft-drop',
  ArrowUp: 'rotate-cw',
  KeyZ: 'rotate-cw',
  KeyX: 'rotate-ccw',
  Space: 'hard-drop',
  KeyP: 'pause',
  Escape: 'pause',
  KeyM: 'mute',
  Enter: 'start',
  KeyR: 'restart',
};

const DIRECTIONAL: Partial<Record<InputIntent, Direction>> = {
  'move-left': 'left',
  'move-right': 'right',
  'soft-drop': 'down',
};

/** Delayed-auto-shift tuning for held movement keys / buttons. */
const DAS_FIRST_DELAY = 0.16;
const DAS_REPEAT = 0.055;
const SOFT_DROP_REPEAT = 0.035;

interface HeldState {
  since: number;
  lastRepeat: number;
}

export interface InputButtonIds {
  left: string;
  right: string;
  down: string;
  rotateCw: string;
  rotateCcw: string;
  drop: string;
  pause: string;
  mute: string;
}

/**
 * Unified input: keyboard and touch buttons emit the same intents. Directional
 * intents auto-repeat with classic DAS timing while held; one-shot intents
 * queue once per press. The game loop polls `poll(delta)`.
 */
export class InputController {
  private readonly queue: InputIntent[] = [];
  private readonly held = new Map<Direction, HeldState>();
  private readonly boundKeys = new Set<string>();
  private disposed = false;

  constructor(
    private readonly buttonIds: InputButtonIds,
    private readonly target: Window = window,
  ) {
    target.addEventListener('keydown', this.onKeyDown, { passive: false });
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.bindButtons();
  }

  private bindButtons(): void {
    const bindings: Array<[keyof InputButtonIds, InputIntent]> = [
      ['left', 'move-left'],
      ['right', 'move-right'],
      ['down', 'soft-drop'],
      ['rotateCw', 'rotate-cw'],
      ['rotateCcw', 'rotate-ccw'],
      ['drop', 'hard-drop'],
      ['pause', 'pause'],
      ['mute', 'mute'],
    ];
    for (const [key, intent] of bindings) {
      const button = document.getElementById(this.buttonIds[key]) as HTMLButtonElement | null;
      if (!button) continue;
      const down = (event: PointerEvent) => {
        event.preventDefault();
        if (button.disabled) return;
        button.setPointerCapture?.(event.pointerId);
        this.press(intent);
      };
      const up = (event: PointerEvent) => {
        event.preventDefault();
        this.release(intent);
      };
      button.addEventListener('pointerdown', down);
      button.addEventListener('pointerup', up);
      button.addEventListener('pointercancel', up);
      button.addEventListener('lostpointercapture', up);
    }
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) return; // repeats handled by DAS polling
    const intent = KEY_MAP[event.code];
    if (!intent) return;
    if (
      event.code.startsWith('Arrow') ||
      event.code === 'Space' ||
      event.code === 'KeyZ' ||
      event.code === 'KeyX'
    ) {
      event.preventDefault();
    }
    this.boundKeys.add(event.code);
    this.press(intent);
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    const intent = KEY_MAP[event.code];
    if (!intent) return;
    this.boundKeys.delete(event.code);
    this.release(intent);
  };

  private readonly onBlur = () => this.releaseAll();

  private readonly onVisibility = () => {
    if (document.hidden) this.releaseAll();
  };

  press(intent: InputIntent): void {
    const dir = DIRECTIONAL[intent];
    if (dir) {
      if (!this.held.has(dir)) {
        this.held.set(dir, { since: 0, lastRepeat: 0 });
        this.queue.push(intent);
      }
      return;
    }
    this.queue.push(intent);
  }

  release(intent: InputIntent): void {
    const dir = DIRECTIONAL[intent];
    if (dir) this.held.delete(dir);
  }

  private releaseAll(): void {
    this.held.clear();
    this.boundKeys.clear();
  }

  /** Intents available this frame, including DAS auto-repeats. */
  poll(delta: number): InputIntent[] {
    const intents = this.queue.splice(0, this.queue.length);
    for (const [dir, state] of this.held) {
      state.since += delta;
      const interval = dir === 'down' ? SOFT_DROP_REPEAT : DAS_REPEAT;
      if (state.since < DAS_FIRST_DELAY) continue;
      state.lastRepeat += delta;
      while (state.lastRepeat >= interval) {
        state.lastRepeat -= interval;
        intents.push(dir === 'left' ? 'move-left' : dir === 'right' ? 'move-right' : 'soft-drop');
      }
    }
    return intents;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.releaseAll();
  }
}
