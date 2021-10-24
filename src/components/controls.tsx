import { Duration } from 'luxon';
import NoSleep from 'nosleep.js';
import { createSignal, lazy, Show } from 'solid-js';
import { clock, getTimeElapsed, setClock, setFile } from '../utils';
import { once } from 'lodash-es';

const getNoSleep = once(() => new NoSleep());

const IoMenuSharp = lazy(async () => {
  if (typeof window !== 'undefined') {
    const { IoMenuSharp } = await import('solid-icons/io');
    return { default: IoMenuSharp };
  } else {
    return { default: () => null };
  }
});

export const Controls = (props: { timeElapsed: string }) => {
  const [isOpen, setIsOpen] = createSignal(true);

  return (
    <>
      <Show when={isOpen()}>
        <form className="absolute left-0 right-0 top-0 bg-gradient-to-b from-white to-transparent pb-8 pl-[env(safe-area-inset-left,0)] pr-[env(safe-area-inset-right,0)]">
          {/* padding */}
          <div className="h-[env(safe-area-inset-top,0)]"></div>

          <input
            class="block w-full"
            type="file"
            onChange={(event) =>
              setFile((event.target as HTMLInputElement).files?.[0])
            }
          />
        </form>

        <div class="absolute bottom-0 left-0 right-0  bg-gradient-to-t from-white to-transparent pt-16 pl-[env(safe-area-inset-left,0)] pr-[env(safe-area-inset-right,0)]">
          <div className="flex flex-wrap justify-center gap-2 items-center">
            <div class="inline-flex flex-col items-end">
              <label htmlFor="">Time elapsed</label>
              <div class="tabular-nums">{props.timeElapsed}</div>
              <input
                className="form-input text-right py-0"
                type="text"
                placeholder="set time"
                value="00:00:00"
                onInput={(event) => {
                  const duration = Duration.fromISOTime(
                    (event.target as HTMLInputElement).value,
                    {}
                  );
                  if (!duration.isValid) {
                    return;
                  }
                  setClock({
                    lastActionAt: new Date(),
                    lastTimeElapsedMs: duration.toMillis(),
                  });
                }}
              />
            </div>

            <div class="inline-flex flex-col items-center">
              <div>Speed</div>
              {clock.playSpeed}x
            </div>

            <button
              onClick={() => {
                setClock({
                  lastActionAt: new Date(),
                  lastTimeElapsedMs: getTimeElapsed() - 100,
                });
              }}
            >
              B100ms
            </button>

            <button
              class="text-2xl"
              onClick={() => {
                const isPlaying = !clock.isPlaying;

                if (isPlaying) {
                  getNoSleep().enable();
                } else {
                  getNoSleep().disable();
                }

                setClock({
                  lastActionAt: new Date(),
                  // todo: recalculate at time of action
                  // instead of using Signal
                  lastTimeElapsedMs: getTimeElapsed(),
                  isPlaying,
                });
              }}
            >
              {clock.isPlaying ? '⏸️' : '▶️'}
            </button>

            <button
              onClick={() => {
                setClock({
                  lastActionAt: new Date(),
                  lastTimeElapsedMs: getTimeElapsed() + 100,
                });
              }}
            >
              F100ms
            </button>

            <input
              type="text"
              class="form-input"
              value={clock.playSpeed}
              onInput={(event) => {
                const newPlaySpeed = parseFloat(
                  (event.target as HTMLInputElement).value
                );
                if (Number.isFinite(newPlaySpeed)) {
                  setClock({
                    playSpeed: parseFloat(
                      (event.target as HTMLInputElement).value
                    ),
                    lastActionAt: new Date(),
                    lastTimeElapsedMs: getTimeElapsed(),
                  });
                }
              }}
            />
          </div>

          {/* padding */}
          <div className="h-[env(safe-area-inset-bottom,0)]"></div>
        </div>
      </Show>

      <button
        onClick={() => setIsOpen((isOpen) => !isOpen)}
        className="absolute top-[env(safe-area-inset-top,0)] w-10 right-[env(safe-area-inset-right,0)] h-10 active:ring-white bg-gray-700 flex justify-center items-center"
      >
        <IoMenuSharp size={24} color="white" />
      </button>
    </>
  );
};
