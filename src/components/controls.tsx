import { once } from 'lodash-es';
import NoSleep from 'nosleep.js';
import { createSignal, Show } from 'solid-js';
import {
  clock,
  getTimeElapsed,
  getTimeElapsedAsDuration,
  setClock,
  setTextSize,
  TEXT_SIZES,
} from '../utils';
import { LeftIcon, MenuIcon, PauseIcon, PlayIcon, RightIcon } from './icons';
import { NumberInput } from './text-input';

const getNoSleep = once(() => new NoSleep());

const IconTextButton = ({ icon, text, onClick }: any) => {
  return (
    <button
      className="h-10 w-10 relative hover:bg-white active:bg-white"
      onClick={onClick}
    >
      <div className="absolute top-0 left-0 right-0 flex justify-center">
        {icon}
      </div>
      <div className="absolute bottom-0 left-0 right-0 text-center">{text}</div>
    </button>
  );
};

const TextButton = ({ children, onClick }: any) => {
  return (
    <button
      className="h-10 w-10 relative hover:bg-white active:bg-white flex justify-center items-center"
      onClick={onClick}
    >
      {children}
    </button>
  );
};

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
            <div className="flex gap-2 justify-center items-center">
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
            </div>

            <div className="flex justify-center items-center">
              <IconTextButton
                icon={<LeftIcon />}
                text={'1s'}
                onClick={() => {
                  setClock({
                    lastActionAt: new Date(),
                    lastTimeElapsedMs: getTimeElapsed() - 1000,
                  });
                }}
              />

              <IconTextButton
                icon={<LeftIcon />}
                text={'0.1s'}
                onClick={() => {
                  setClock({
                    lastActionAt: new Date(),
                    lastTimeElapsedMs: getTimeElapsed() - 100,
                  });
                }}
              />

              <button
                class="h-10 w-10 flex justify-center items-center hover:bg-white active:bg-white"
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
                {clock.isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>

              <IconTextButton
                icon={<RightIcon />}
                text={'0.1s'}
                onClick={() => {
                  setClock({
                    lastActionAt: new Date(),
                    lastTimeElapsedMs: getTimeElapsed() + 100,
                  });
                }}
              />

              <IconTextButton
                icon={<RightIcon />}
                text={'1s'}
                onClick={() => {
                  setClock({
                    lastActionAt: new Date(),
                    lastTimeElapsedMs: getTimeElapsed() + 1000,
                  });
                }}
              />
            </div>

            {/* text size */}
            <div className="flex justify-center items-center">
              <TextButton onClick={() => setTextSize(TEXT_SIZES[0])}>
                XS
              </TextButton>
              <TextButton onClick={() => setTextSize(TEXT_SIZES[1])}>
                SM
              </TextButton>
              <TextButton onClick={() => setTextSize(TEXT_SIZES[2])}>
                MD
              </TextButton>
              <TextButton onClick={() => setTextSize(TEXT_SIZES[3])}>
                LG
              </TextButton>
            </div>
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
