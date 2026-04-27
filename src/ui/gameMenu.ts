import type { CarHudState } from "../game/carController";
import { ProceduralBgm } from "../audio/bgm";

type GameMenuOptions = {
  onPauseChange: (paused: boolean) => void;
  onReplay: () => void;
};

export type GameMenu = {
  isPaused: () => boolean;
  playCrash: (strength: number) => void;
  update: (state: CarHudState) => void;
  destroy: () => void;
};

export function createGameMenu(options: GameMenuOptions): GameMenu {
  const menu = requireElement<HTMLElement>("#game-menu");
  const menuButton = requireElement<HTMLButtonElement>("#menu-button");
  const closeButton = requireElement<HTMLButtonElement>("#menu-close");
  const resumeButton = requireElement<HTMLButtonElement>("#menu-resume");
  const volumeInput = requireElement<HTMLInputElement>("#volume-control");
  const muteInput = requireElement<HTMLInputElement>("#mute-toggle");
  const musicInput = requireElement<HTMLInputElement>("#music-toggle");
  const menuSpeed = requireElement<HTMLElement>("#menu-speed");
  const menuLap = requireElement<HTMLElement>("#menu-lap");
  const menuTime = requireElement<HTMLElement>("#menu-time");
  const summary = requireElement<HTMLElement>("#race-summary");
  const summaryTotal = requireElement<HTMLElement>("#summary-total");
  const summaryBest = requireElement<HTMLElement>("#summary-best");
  const summaryLaps = requireElement<HTMLElement>("#summary-laps");
  const replayButton = requireElement<HTMLButtonElement>("#summary-replay");
  const audio = new ProceduralBgm();
  let paused = false;
  let summaryVisible = false;

  const savedVolume = Number.parseFloat(
    window.localStorage.getItem("jungle-sprint-volume") ?? "",
  );
  const savedMuted = window.localStorage.getItem("jungle-sprint-muted") === "true";
  const savedMusic = window.localStorage.getItem("jungle-sprint-music") !== "false";

  if (Number.isFinite(savedVolume)) {
    volumeInput.value = formatVolume(savedVolume);
  }

  muteInput.checked = savedMuted;
  musicInput.checked = savedMusic;
  audio.setVolume(Number.parseFloat(volumeInput.value));
  audio.setMuted(muteInput.checked);
  audio.setEnabled(musicInput.checked);

  const unlockAudio = (): void => {
    void audio.unlock();
  };

  const setPaused = (nextPaused: boolean): void => {
    paused = nextPaused;
    menu.hidden = !paused;
    menuButton.setAttribute("aria-expanded", String(paused));
    document.body.classList.toggle("menu-open", paused);
    options.onPauseChange(paused);

    if (paused) {
      resumeButton.focus({ preventScroll: true });
    } else {
      menuButton.focus({ preventScroll: true });
    }
  };

  const togglePaused = (): void => setPaused(!paused);

  const handleKeyDown = (event: KeyboardEvent): void => {
    unlockAudio();

    if (event.code === "Escape") {
      event.preventDefault();
      togglePaused();
    }
  };

  const handlePointerDown = (): void => unlockAudio();
  const handleMenuButtonClick = (): void => {
    unlockAudio();
    setPaused(true);
  };
  const handleClose = (): void => setPaused(false);
  const handleVolumeInput = (): void => {
    const volume = Number.parseFloat(volumeInput.value);
    audio.setVolume(volume);
    window.localStorage.setItem("jungle-sprint-volume", volume.toFixed(2));
  };
  const handleMuteChange = (): void => {
    audio.setMuted(muteInput.checked);
    window.localStorage.setItem("jungle-sprint-muted", String(muteInput.checked));
  };
  const handleMusicChange = (): void => {
    audio.setEnabled(musicInput.checked);
    window.localStorage.setItem("jungle-sprint-music", String(musicInput.checked));

    if (musicInput.checked) {
      void audio.unlock();
    }
  };
  const handleReplay = (): void => {
    summaryVisible = false;
    summary.hidden = true;
    setPaused(false);
    options.onReplay();
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("pointerdown", handlePointerDown);
  menuButton.addEventListener("click", handleMenuButtonClick);
  closeButton.addEventListener("click", handleClose);
  resumeButton.addEventListener("click", handleClose);
  volumeInput.addEventListener("input", handleVolumeInput);
  muteInput.addEventListener("change", handleMuteChange);
  musicInput.addEventListener("change", handleMusicChange);
  replayButton.addEventListener("click", handleReplay);

  return {
    isPaused: () => paused,
    playCrash(strength: number): void {
      audio.playCrash(strength);
    },
    update(state: CarHudState): void {
      menuSpeed.textContent = `${Math.round(state.speedKph)} km/h`;
      menuLap.textContent = `${state.lap}/${state.targetLaps}`;
      menuTime.textContent = formatTime(state.raceTime);

      if (state.finished) {
        summaryVisible = true;
        summary.hidden = false;
        summaryTotal.textContent = formatTime(state.raceTime);
        summaryBest.textContent =
          state.bestLapTime === null ? "--" : formatTime(state.bestLapTime);
        summaryLaps.textContent = `${state.targetLaps}/${state.targetLaps}`;
      } else if (summaryVisible) {
        summaryVisible = false;
        summary.hidden = true;
      }
    },
    destroy(): void {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
      menuButton.removeEventListener("click", handleMenuButtonClick);
      closeButton.removeEventListener("click", handleClose);
      resumeButton.removeEventListener("click", handleClose);
      volumeInput.removeEventListener("input", handleVolumeInput);
      muteInput.removeEventListener("change", handleMuteChange);
      musicInput.removeEventListener("change", handleMusicChange);
      replayButton.removeEventListener("click", handleReplay);
      audio.destroy();
    },
  };
}

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing menu element ${selector}`);
  }

  return element;
}

function formatVolume(value: number): string {
  return Math.min(1, Math.max(0, value)).toFixed(2);
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}
