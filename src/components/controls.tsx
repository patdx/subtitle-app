import { once } from 'lodash-es';
import { Duration } from 'luxon';
import NoSleep from 'nosleep.js';
import { createSignal, Show } from 'solid-js';
import {
  clock,
  getTimeElapsed,
  getTimeElapsedAsDuration,
  setClock,
} from '../utils';
import { LeftIcon, MenuIcon, RightIcon } from './icons';
import { NumberInput } from './text-input';

const getNoSleep = once(() => new NoSleep());

export const Controls = () => {
  const [isOpen, setIsOpen] = createSignal(true);

  return (
    <>
      <Show when={isOpen()}>
        <div className="absolute left-0 right-0 top-0 bg-gradient-to-b from-white to-transparent pb-8 pl-[env(safe-area-inset-left,0)] pr-[env(safe-area-inset-right,0)]">
          {/* padding */}
          <div className="h-[env(safe-area-inset-top,0)]"></div>
          <a href="/">Manage files</a>
        </div>

        <div class="absolute bottom-0 left-0 right-0  bg-gradient-to-t from-white to-transparent pt-16 pl-[env(safe-area-inset-left,0)] pr-[env(safe-area-inset-right,0)]">
          <div className="flex flex-wrap justify-center gap-2 items-center">
            <div>
              <NumberInput
                value={getTimeElapsedAsDuration().hours}
                padWidth={2}
                suffix="h"
                onChange={(value) => {
                  const duration = getTimeElapsedAsDuration().set({
                    hours: value,
                  });
                  setClock({
                    lastActionAt: new Date(),
                    lastTimeElapsedMs: duration.toMillis(),
                  });
                }}
              />

              <NumberInput
                value={getTimeElapsedAsDuration().minutes}
                padWidth={2}
                suffix="m"
                onChange={(value) => {
                  const duration = getTimeElapsedAsDuration().set({
                    minutes: value,
                  });
                  setClock({
                    lastActionAt: new Date(),
                    lastTimeElapsedMs: duration.toMillis(),
                  });
                }}
              />

              <NumberInput
                value={getTimeElapsedAsDuration().seconds}
                padWidth={2}
                suffix="s"
                onChange={(value) => {
                  const duration = getTimeElapsedAsDuration().set({
                    seconds: value,
                  });
                  setClock({
                    lastActionAt: new Date(),
                    lastTimeElapsedMs: duration.toMillis(),
                  });
                }}
              />

              <NumberInput
                widthClassName="w-20"
                padWidth={3}
                value={getTimeElapsedAsDuration().milliseconds}
                suffix="ms"
                onChange={(value) => {
                  const duration = getTimeElapsedAsDuration().set({
                    milliseconds: value,
                  });
                  setClock({
                    lastActionAt: new Date(),
                    lastTimeElapsedMs: duration.toMillis(),
                  });
                }}
              />
            </div>

            <NumberInput
              value={clock.playSpeed}
              suffix="x"
              onChange={(value) => {
                const newPlaySpeed =
                  typeof value === 'string' ? parseFloat(value) : undefined;

                if (Number.isFinite(newPlaySpeed)) {
                  setClock({
                    playSpeed: newPlaySpeed,
                    lastActionAt: new Date(),
                    lastTimeElapsedMs: getTimeElapsed(),
                  });
                }
              }}
            />

            <button
              className="flex flex-col"
              onClick={() => {
                setClock({
                  lastActionAt: new Date(),
                  lastTimeElapsedMs: getTimeElapsed() - 1000,
                });
              }}
            >
              <LeftIcon />
              <div>1s</div>
            </button>

            <button
              className="flex flex-col"
              onClick={() => {
                setClock({
                  lastActionAt: new Date(),
                  lastTimeElapsedMs: getTimeElapsed() - 100,
                });
              }}
            >
              <LeftIcon />
              <div>0.1s</div>
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
              className="flex flex-col"
              onClick={() => {
                setClock({
                  lastActionAt: new Date(),
                  lastTimeElapsedMs: getTimeElapsed() + 100,
                });
              }}
            >
              <RightIcon />
              <div>0.1s</div>
            </button>

            <button
              className="flex flex-col"
              onClick={() => {
                setClock({
                  lastActionAt: new Date(),
                  lastTimeElapsedMs: getTimeElapsed() + 1000,
                });
              }}
            >
              <RightIcon />
              <div>1s</div>
            </button>
          </div>

          {/* padding */}
          <div className="h-[env(safe-area-inset-bottom,0)]"></div>
        </div>
      </Show>

      <button
        onClick={() => setIsOpen((isOpen) => !isOpen)}
        className="absolute top-[env(safe-area-inset-top,0)] w-10 right-[env(safe-area-inset-right,0)] h-10 active:ring-white bg-gray-700 flex justify-center items-center"
      >
        <MenuIcon />
      </button>
    </>
  );
};
