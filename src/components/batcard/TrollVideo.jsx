import { useEffect, useRef, useState } from 'react';

const base = () => `${import.meta.env.BASE_URL}batcard/media/`;

export default function TrollVideo({ visible, onPlayingChange }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const changePlaying = (next) => {
    setPlaying(next);
    onPlayingChange?.(next);
  };

  const stop = () => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
    changePlaying(false);
  };

  const toggle = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      stop();
      return;
    }

    video.currentTime = 0;
    changePlaying(true);
    try {
      await video.play();
    } catch {
      changePlaying(false);
    }
  };

  useEffect(() => {
    if (!visible && playing) stop();
  }, [visible, playing]);

  useEffect(() => () => onPlayingChange?.(false), [onPlayingChange]);

  return (
    <>
      <video
        ref={videoRef}
        className={`bc-troll-video${playing ? ' is-playing' : ''}`}
        src={`${base()}troll-video.mp4`}
        preload="metadata"
        playsInline
        onEnded={stop}
        onError={() => changePlaying(false)}
        aria-hidden="true"
      />
      {visible && (
        <button
          type="button"
          className={`bc-troll-trigger${playing ? ' is-playing' : ''}`}
          onClick={toggle}
          aria-label={playing ? 'Detener video de Trollface' : 'Reproducir video de Trollface'}
          aria-pressed={playing}
          title={playing ? 'Detener video' : 'Trollface'}
        >
          <img src={`${base()}trollface-button.webp`} alt="" />
        </button>
      )}
    </>
  );
}
