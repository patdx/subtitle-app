import clsx from 'clsx';
import { Duration } from 'luxon';
import { createSignal, Show } from 'solid-js';
import { clock, getTimeElapsed, setClock, setFile } from '../utils';

export const Controls = (props: { timeElapsed: string }) => {
  const [isOpen, setIsOpen] = createSignal(true);

  return (
    <>
      <Show when={isOpen()}>
        {' '}
        <form className="absolute left-0 right-0 top-0 bg-gradient-to-b from-white to-transparent pb-8">
          <input
            class="block w-full"
            type="file"
            onChange={(event) =>
              setFile((event.target as HTMLInputElement).files?.[0])
            }
          />
        </form>
        <div class="absolute bottom-0 left-0 right-0 flex gap-2 items-center bg-gradient-to-t from-white to-transparent pt-8">
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
              setClock((previous) => ({
                lastActionAt: new Date(),
                // todo: recalculate at time of action
                // instead of using Signal
                lastTimeElapsedMs: getTimeElapsed(),
                isPlaying: !previous.isPlaying,
              }));
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
      </Show>

      <button
        onClick={() => setIsOpen((isOpen) => !isOpen)}
        className={clsx(
          `absolute top-0 w-10 right-0 h-10 active:ring-white`,
          !isOpen() && `text-white`
        )}
      >
        M
      </button>
    </>
  );
};
