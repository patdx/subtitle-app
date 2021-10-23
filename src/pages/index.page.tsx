import { DateTime, Duration } from 'luxon';
import { Component, createSignal, onMount } from 'solid-js';
import { createStore } from 'solid-js/store';
import { FileDisplay } from '../components/file-display';
import { getTimeElapsed, setTimeElapsed } from '../utils';

const [clock, setClock] = createStore({
  lastActionAt: new Date(),
  lastTimeElapsedMs: 0,
  playSpeed: 1,
  isPlaying: false,
});

const App: Component = () => {
  const [getFile, setFile] = createSignal<File>();

  const updateElapsedTime = () => {
    const timeSinceLastAction = clock.isPlaying
      ? Math.abs(DateTime.fromJSDate(clock.lastActionAt).diffNow().toMillis()) *
        clock.playSpeed
      : 0;
    setTimeElapsed(timeSinceLastAction + clock.lastTimeElapsedMs);
    requestAnimationFrame(updateElapsedTime);
  };

  onMount(() => {
    requestAnimationFrame(updateElapsedTime);
  });

  const formattedTime = () =>
    Duration.fromMillis(getTimeElapsed()).toISOTime({
      suppressMilliseconds: true,
    });

  return (
    <>
      {/* <pre className="whitespace-pre-wrap">
        {JSON.stringify({ ...clock }, undefined, 2)}
      </pre> */}

      <form>
        <input
          class="block w-full"
          type="file"
          onChange={(event) =>
            setFile((event.target as HTMLInputElement).files?.[0])
          }
        />
      </form>

      <div class="flex gap-2 items-center">
        <div class="inline-flex flex-col items-end">
          <label htmlFor="">Time elapsed</label>
          <div class="tabular-nums">{formattedTime()}</div>
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
                playSpeed: parseFloat((event.target as HTMLInputElement).value),
                lastActionAt: new Date(),
                lastTimeElapsedMs: getTimeElapsed(),
              });
            }
          }}
        />
      </div>

      <FileDisplay file={getFile()} />
    </>
  );
};

export default App;
