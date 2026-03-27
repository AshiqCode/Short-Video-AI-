import { useEffect, useMemo, useRef, useState } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import "./App.css";

const RATIO_PRESETS = [
  {
    id: "original",
    label: "Original",
    icon: "▣",
    description: "No crop",
    ratio: null,
  },
  {
    id: "9:16",
    label: "9:16",
    icon: "▯",
    description: "TikTok / YT Shorts / Reels",
    ratio: [9, 16],
  },
  {
    id: "1:1",
    label: "1:1",
    icon: "■",
    description: "Instagram / Twitter",
    ratio: [1, 1],
  },
  {
    id: "4:5",
    label: "4:5",
    icon: "▮",
    description: "Instagram Portrait",
    ratio: [4, 5],
  },
  {
    id: "16:9",
    label: "16:9",
    icon: "▬",
    description: "YouTube / Landscape",
    ratio: [16, 9],
  },
];

function App() {
  const ffmpegRef = useRef(null);
  const videoBlobUrlsRef = useRef([]);

  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [ffmpegLoading, setFfmpegLoading] = useState(true);

  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoDimensions, setVideoDimensions] = useState({ w: 0, h: 0 });
  const [totalShorts, setTotalShorts] = useState(3);
  const [secondsPerShort, setSecondsPerShort] = useState(30);
  const [selectedRatio, setSelectedRatio] = useState("original");

  const [isCutting, setIsCutting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generatedVideos, setGeneratedVideos] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");

  const estimatedTotalDuration = useMemo(
    () => totalShorts * secondsPerShort,
    [totalShorts, secondsPerShort]
  );

  const selectedPreset = RATIO_PRESETS.find((p) => p.id === selectedRatio);

  useEffect(() => {
    let mounted = true;

    const loadFFmpeg = async () => {
      try {
        setFfmpegLoading(true);
        setErrorMessage("");

        const ffmpeg = new FFmpeg();

        ffmpeg.on("progress", ({ progress }) => {
          if (!mounted) return;
          setProgress(Math.min(100, Math.round(progress * 100)));
        });

        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

        await ffmpeg.load({
          coreURL: `${baseURL}/ffmpeg-core.js`,
          wasmURL: `${baseURL}/ffmpeg-core.wasm`,
          workerURL: `${baseURL}/ffmpeg-core.worker.js`,
        });

        if (!mounted) return;

        ffmpegRef.current = ffmpeg;
        setFfmpegLoaded(true);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage("Failed to load video engine.");
      } finally {
        if (mounted) setFfmpegLoading(false);
      }
    };

    loadFFmpeg();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!videoFile) {
      setVideoUrl("");
      setVideoDuration(0);
      return;
    }

    const url = URL.createObjectURL(videoFile);
    setVideoUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [videoFile]);

  useEffect(() => {
    return () => {
      videoBlobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const clearGeneratedVideos = () => {
    videoBlobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    videoBlobUrlsRef.current = [];
    setGeneratedVideos([]);
  };

  const handleVideoSelect = (e) => {
    const file = e.target.files?.[0] || null;
    clearGeneratedVideos();
    setProgress(0);
    setIsCutting(false);
    setErrorMessage("");
    setVideoFile(file);
    setVideoDimensions({ w: 0, h: 0 });
  };

  const handleLoadedMetadata = (e) => {
    const duration = e.currentTarget.duration || 0;
    const w = e.currentTarget.videoWidth || 0;
    const h = e.currentTarget.videoHeight || 0;
    setVideoDuration(duration);
    setVideoDimensions({ w, h });
  };

  const formatSeconds = (value) => {
    const total = Math.max(0, Math.floor(value));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const buildCropFilter = (preset, videoW, videoH) => {
    if (!preset || !preset.ratio) return null;
    const [rw, rh] = preset.ratio;
    const targetRatio = rw / rh;
    const srcRatio = videoW / videoH;

    let cropW, cropH;
    if (srcRatio > targetRatio) {
      // Source is wider than target → crop sides
      cropH = videoH;
      cropW = Math.floor(videoH * targetRatio);
    } else {
      // Source is taller than target → crop top/bottom
      cropW = videoW;
      cropH = Math.floor(videoW / targetRatio);
    }

    // Make dimensions even (required by libx264)
    cropW = cropW % 2 === 0 ? cropW : cropW - 1;
    cropH = cropH % 2 === 0 ? cropH : cropH - 1;

    const x = Math.floor((videoW - cropW) / 2);
    const y = Math.floor((videoH - cropH) / 2);

    return `crop=${cropW}:${cropH}:${x}:${y}`;
  };

  const handleGenerateShorts = async () => {
    if (!videoFile || !videoDuration || !ffmpegRef.current || !ffmpegLoaded) {
      return;
    }

    clearGeneratedVideos();
    setIsCutting(true);
    setProgress(0);
    setErrorMessage("");

    const ffmpeg = ffmpegRef.current;
    const extension = videoFile.name.split(".").pop()?.toLowerCase() || "mp4";
    const safeExtension =
      extension === "mov" ||
      extension === "mkv" ||
      extension === "webm" ||
      extension === "mp4"
        ? extension
        : "mp4";

    const inputName = `input.${safeExtension}`;

    // Use actual video dimensions captured on metadata load
    const videoW = videoDimensions.w || 1920;
    const videoH = videoDimensions.h || 1080;
    const cropFilter = buildCropFilter(selectedPreset, videoW, videoH);

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

      const clips = [];
      const maxClipsByDuration = Math.ceil(videoDuration / secondsPerShort);
      const clipsToGenerate = Math.min(totalShorts, maxClipsByDuration);

      for (let i = 0; i < clipsToGenerate; i += 1) {
        const startTime = i * secondsPerShort;

        if (startTime >= videoDuration) break;

        const actualDuration = Math.min(
          secondsPerShort,
          videoDuration - startTime
        );

        const outputName = `output_${i + 1}.mp4`;

        // If no crop needed, use stream copy (fast). If crop needed, must re-encode.
        let ffmpegArgs;
        if (!cropFilter) {
          ffmpegArgs = [
            "-ss", String(startTime),
            "-i", inputName,
            "-t", String(actualDuration),
            "-map", "0",
            "-c", "copy",
            outputName,
          ];
        } else {
          ffmpegArgs = [
            "-ss", String(startTime),
            "-i", inputName,
            "-t", String(actualDuration),
            "-vf", cropFilter,
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-c:a", "aac",
            outputName,
          ];
        }

        await ffmpeg.exec(ffmpegArgs);

        const data = await ffmpeg.readFile(outputName);
        const blob = new Blob([data.buffer], { type: "video/mp4" });
        const clipUrl = URL.createObjectURL(blob);

        videoBlobUrlsRef.current.push(clipUrl);

        const ratioSuffix = selectedRatio !== "original" ? `-${selectedRatio.replace(":", "x")}` : "";

        clips.push({
          id: i + 1,
          name: `${videoFile.name.replace(/\.[^/.]+$/, "")}-short-${i + 1}${ratioSuffix}.mp4`,
          url: clipUrl,
          startTime,
          duration: actualDuration,
        });

        setGeneratedVideos([...clips]);
        setProgress(Math.round(((i + 1) / clipsToGenerate) * 100));

        await ffmpeg.deleteFile(outputName);
      }

      try {
        await ffmpeg.deleteFile(inputName);
      } catch {}
    } catch (error) {
      console.error(error);
      setErrorMessage("Failed to cut video. If you selected a ratio, the video may need to be re-encoded which takes longer.");
      try {
        await ffmpeg.deleteFile(inputName);
      } catch {}
    } finally {
      setIsCutting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-4 py-10">
        <div className="grid w-full gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl">
            <div className="border-b border-white/10 px-6 py-5">
              <p className="text-sm font-medium uppercase tracking-[0.25em] text-cyan-300">
                Video Cutter
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                Create short videos from one long video
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Upload a long video, choose how many shorts you want, set the
                duration, and pick a platform ratio.
              </p>
            </div>

            <div className="space-y-6 px-6 py-6">
              {/* Upload */}
              <div className="rounded-2xl border border-dashed border-cyan-400/30 bg-slate-900/60 p-5">
                <label className="mb-3 block text-sm font-medium text-slate-200">
                  Upload long video
                </label>

                <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-white/10 bg-slate-950/70 px-6 py-10 text-center transition hover:border-cyan-400/40 hover:bg-slate-900">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-300">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-7 w-7"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 16V4m0 0l-4 4m4-4l4 4M4 16.5v1.25A2.25 2.25 0 006.25 20h11.5A2.25 2.25 0 0020 17.75V16.5"
                      />
                    </svg>
                  </div>

                  <p className="text-base font-semibold text-white">
                    Click to upload video
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    MP4, MOV, AVI, MKV, WEBM
                  </p>

                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={handleVideoSelect}
                  />
                </label>

                {videoFile && (
                  <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
                    <p className="text-sm font-medium text-emerald-300">
                      Selected Video
                    </p>
                    <p className="mt-1 truncate text-sm text-slate-200">
                      {videoFile.name}
                    </p>
                  </div>
                )}

                {videoUrl && (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black">
                    <video
                      src={videoUrl}
                      controls
                      className="max-h-[320px] w-full"
                      onLoadedMetadata={handleLoadedMetadata}
                    />
                  </div>
                )}
              </div>

              {/* Sliders */}
              <div className="grid gap-5 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                  <label className="mb-3 block text-sm font-medium text-slate-200">
                    Total videos to generate
                  </label>

                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={totalShorts}
                    onChange={(e) =>
                      setTotalShorts(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                  />

                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={totalShorts}
                    onChange={(e) => setTotalShorts(Number(e.target.value))}
                    className="mt-4 w-full accent-cyan-400"
                  />
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                  <label className="mb-3 block text-sm font-medium text-slate-200">
                    Time of each short (seconds)
                  </label>

                  <input
                    type="number"
                    min="1"
                    max="300"
                    value={secondsPerShort}
                    onChange={(e) =>
                      setSecondsPerShort(
                        Math.max(1, Number(e.target.value) || 1)
                      )
                    }
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                  />

                  <input
                    type="range"
                    min="1"
                    max="120"
                    value={secondsPerShort}
                    onChange={(e) => setSecondsPerShort(Number(e.target.value))}
                    className="mt-4 w-full accent-cyan-400"
                  />
                </div>
              </div>

              {/* Aspect Ratio Selector */}
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                <label className="mb-1 block text-sm font-medium text-slate-200">
                  Output aspect ratio
                </label>
                <p className="mb-4 text-xs text-slate-400">
                  Crops the video to fit the selected platform. Cropping requires
                  re-encoding and takes longer than a plain cut.
                </p>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {RATIO_PRESETS.map((preset) => {
                    const isActive = selectedRatio === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setSelectedRatio(preset.id)}
                        className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center transition ${
                          isActive
                            ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                            : "border-white/10 bg-slate-950/60 text-slate-300 hover:border-white/30 hover:bg-slate-800/60"
                        }`}
                      >
                        <span
                          className="flex items-center justify-center text-2xl leading-none"
                          style={{
                            width: 32,
                            height: 32,
                            fontSize:
                              preset.id === "original"
                                ? 22
                                : preset.id === "9:16"
                                ? 20
                                : preset.id === "1:1"
                                ? 22
                                : preset.id === "4:5"
                                ? 20
                                : 20,
                          }}
                        >
                          {preset.icon}
                        </span>
                        <span className="text-sm font-semibold leading-tight">
                          {preset.label}
                        </span>
                        <span className="text-[10px] leading-tight text-slate-400">
                          {preset.description}
                        </span>
                      </button>
                    );
                  })}
                </div>

              </div>

              {errorMessage && (
                <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {errorMessage}
                </div>
              )}
              <button
                type="button"
                onClick={handleGenerateShorts}
                disabled={
                  !videoFile || !ffmpegLoaded || ffmpegLoading || isCutting
                }
                className="inline-flex w-full items-center justify-center rounded-2xl bg-cyan-400 px-5 py-4 text-base font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {ffmpegLoading
                  ? "Loading video engine..."
                  : isCutting
                  ? "Cutting Video..."
                  : "Generate Shorts"}
              </button>
            </div>
          </section>

          {/* Right panel */}
          <aside className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl">
            <div className="border-b border-white/10 px-6 py-5">
              <h2 className="text-xl font-semibold text-white">Processing</h2>
              <p className="mt-1 text-sm text-slate-400">
                Cutting status and generated downloads
              </p>
            </div>

            <div className="space-y-4 px-6 py-6">
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                <p className="text-sm text-slate-400">Uploaded video</p>
                <p className="mt-2 text-base font-semibold text-white">
                  {videoFile ? videoFile.name : "No video selected"}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                  <p className="text-sm text-slate-400">Total shorts</p>
                  <p className="mt-2 text-3xl font-bold text-cyan-300">
                    {totalShorts}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                  <p className="text-sm text-slate-400">Each short</p>
                  <p className="mt-2 text-3xl font-bold text-cyan-300">
                    {secondsPerShort}s
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                  <p className="text-sm text-slate-400">Ratio</p>
                  <p className="mt-2 text-xl font-bold text-cyan-300">
                    {selectedPreset?.label ?? "—"}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-5">
                <p className="text-sm text-cyan-200">Estimated total output</p>
                <p className="mt-2 text-2xl font-bold text-white">
                  {estimatedTotalDuration} seconds
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  Source duration: {formatSeconds(videoDuration)}
                </p>
                {selectedRatio !== "original" && (
                  <p className="mt-1 text-sm text-amber-300">
                    Platform: {selectedPreset?.description}
                  </p>
                )}
              </div>

              {isCutting && (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-300/20 border-t-cyan-300" />
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {selectedRatio !== "original"
                          ? "Cutting & cropping your video..."
                          : "Cutting your video..."}
                      </p>
                      <p className="text-sm text-slate-300">
                        {selectedRatio !== "original"
                          ? `Re-encoding to ${selectedRatio} ratio`
                          : "Fast mode using stream copy"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-cyan-400 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <p className="mt-3 text-sm text-cyan-200">{progress}% done</p>
                </div>
              )}

              {!isCutting && generatedVideos.length > 0 && (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-5">
                  <p className="text-base font-semibold text-white">
                    Generated Shorts
                  </p>

                  <div className="mt-4 space-y-3">
                    {generatedVideos.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-white/10 bg-slate-950/60 p-4"
                      >
                        <p className="text-sm font-semibold text-white">
                          Short {item.id}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Start: {formatSeconds(item.startTime)} · Duration:{" "}
                          {formatSeconds(item.duration)}
                          {selectedRatio !== "original" && (
                            <> · Ratio: {selectedRatio}</>
                          )}
                        </p>

                        <video
                          src={item.url}
                          controls
                          className="mt-3 w-full rounded-xl"
                        />

                        <a
                          href={item.url}
                          download={item.name}
                          className="mt-3 inline-flex items-center justify-center rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                        >
                          Download
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!isCutting && generatedVideos.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                  <p className="text-sm font-medium text-slate-200">
                    No generated videos yet
                  </p>
                  <p className="mt-2 text-sm text-slate-400">
                    Upload a video and click generate to create short clips.
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default App;