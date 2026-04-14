"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

/** クライアント側の上限（API の 25MB より厳しめ。アップロード前に検証） */
export const VOICE_CLIENT_MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export type VoiceApplyContext =
  | { source: "whisper" }
  | { source: "browser-speech" };

/** 親の成功表示・トースト用（Whisper 経由） */
export const VOICE_WHISPER_SUCCESS_MESSAGE =
  "文字起こしが完了しました。「今回メモ」を確認し、問題なければ「AIで記録作成」を押してください。";

/** 親の成功表示・トースト用（ブラウザ SpeechRecognition） */
export const VOICE_BROWSER_SPEECH_SUCCESS_MESSAGE =
  "ブラウザ音声を「今回メモ」に追記しました。内容を確認してください。";

type Props = {
  disabled?: boolean;
  /**
   * 音声→テキストの反映。第2引数は Whisper 成功時・ブラウザ音声時に付与（省略可・後方互換）。
   */
  onApplyText: (text: string, context?: VoiceApplyContext) => void;
  onError: (message: string) => void;
  onBusyChange?: (busy: boolean) => void;
};

function formatMegabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(0);
}

function preferRecordingOrFileOnApple(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium/.test(ua);
}

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return undefined;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function VoiceMemoControls({
  disabled = false,
  onApplyText,
  onError,
  onBusyChange,
}: Props) {
  /** SSR では navigator/window が無いため、マウント後にのみ環境依存 UI を出してハイドレーション不一致を防ぐ */
  const [envReady, setEnvReady] = useState(false);
  useEffect(() => {
    setEnvReady(true);
  }, []);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isDictating, setIsDictating] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const setBusy = useCallback(
    (transcribing: boolean) => {
      setIsTranscribing(transcribing);
      onBusyChange?.(transcribing);
    },
    [onBusyChange]
  );

  const appleRecordingHint = envReady && preferRecordingOrFileOnApple();
  const speechAvailable = envReady && Boolean(getSpeechRecognitionCtor());

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const uploadBlob = useCallback(
    async (blob: Blob, filename: string) => {
      if (blob.size > VOICE_CLIENT_MAX_AUDIO_BYTES) {
        onError(
          `音声は ${formatMegabytes(VOICE_CLIENT_MAX_AUDIO_BYTES)}MB 以下にしてください（現在約 ${formatMegabytes(blob.size)}MB）。短く録音するか、圧縮・分割後に「音声ファイル」からアップロードしてください。`
        );
        return;
      }

      const fd = new FormData();
      fd.append("file", blob, filename);
      setBusy(true);
      try {
        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: fd,
        });
        const data: unknown = await res.json().catch(() => null);
        const msg =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : "文字起こしに失敗しました。";
        if (!res.ok) {
          onError(msg);
          return;
        }
        const text =
          data &&
          typeof data === "object" &&
          "text" in data &&
          typeof (data as { text: unknown }).text === "string"
            ? (data as { text: string }).text.trim()
            : "";
        if (!text) {
          onError("文字起こしの結果が空でした。もう一度録音するか、手入力してください。");
          return;
        }
        onApplyText(text, { source: "whisper" });
      } catch {
        onError("通信エラーです。ネットワークを確認するか、手入力してください。");
      } finally {
        setBusy(false);
      }
    },
    [onApplyText, onError, setBusy]
  );

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (mr && mr.state !== "inactive") {
      try {
        mr.stop();
      } catch {
        /* ignore */
      }
    } else {
      stopStream();
      setIsRecording(false);
    }
  }, [stopStream]);

  const startRecording = useCallback(async () => {
    if (disabled || isTranscribing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = pickRecorderMime();
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onerror = () => {
        onError("録音中にエラーが発生しました。");
        stopRecording();
      };

      mr.onstop = () => {
        stopStream();
        setIsRecording(false);
        const ext = mime?.includes("mp4") ? "m4a" : "webm";
        const blob = new Blob(chunksRef.current, {
          type: mr.mimeType || mime || "audio/webm",
        });
        chunksRef.current = [];
        if (blob.size === 0) {
          onError("録音データがありません。マイクの許可を確認してください。");
          return;
        }
        void uploadBlob(blob, `memo.${ext}`);
      };

      mr.start(200);
      setIsRecording(true);
    } catch {
      onError(
        "マイクを使えませんでした。ブラウザの権限を確認するか、「音声ファイル」からアップロード・手入力してください。"
      );
    }
  }, [disabled, isTranscribing, onError, stopRecording, stopStream, uploadBlob]);

  const toggleRecord = useCallback(() => {
    if (isRecording) stopRecording();
    else void startRecording();
  }, [isRecording, startRecording, stopRecording]);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || disabled || isTranscribing) return;
      if (!file.size) {
        onError("ファイルが空です。");
        return;
      }
      if (file.size > VOICE_CLIENT_MAX_AUDIO_BYTES) {
        onError(
          `音声ファイルは ${formatMegabytes(VOICE_CLIENT_MAX_AUDIO_BYTES)}MB 以下にしてください（現在約 ${formatMegabytes(file.size)}MB）。`
        );
        return;
      }
      void uploadBlob(file, file.name);
    },
    [disabled, isTranscribing, onError, uploadBlob]
  );

  const stopDictation = useCallback(() => {
    const r = recognitionRef.current;
    recognitionRef.current = null;
    if (r) {
      try {
        r.stop();
      } catch {
        /* ignore */
      }
    }
    setIsDictating(false);
  }, []);

  const startDictation = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      onError("このブラウザではブラウザ音声入力に未対応です。録音またはファイルを利用してください。");
      return;
    }
    if (disabled || isTranscribing || isRecording) return;

    const r = new Ctor();
    recognitionRef.current = r;
    r.lang = "ja-JP";
    r.continuous = true;
    r.interimResults = false;

    r.onerror = (ev: SpeechRecognitionErrorEvent) => {
      console.warn("[VoiceMemo] SpeechRecognition error:", ev.error);
      onError(
        ev.error === "not-allowed"
          ? "音声入力の許可がありません。録音・ファイル・手入力に切り替えてください。"
          : "ブラウザ音声入力が途中で止まりました。必要なら手入力で続けてください。"
      );
      stopDictation();
    };

    r.onend = () => {
      setIsDictating(false);
      recognitionRef.current = null;
    };

    r.onresult = (ev: SpeechRecognitionEvent) => {
      let line = "";
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        line += ev.results[i][0].transcript;
      }
      const t = line.trim();
      if (t) onApplyText(t, { source: "browser-speech" });
    };

    try {
      r.start();
      setIsDictating(true);
    } catch {
      onError("ブラウザ音声入力を開始できませんでした。");
    }
  }, [
    disabled,
    isRecording,
    isTranscribing,
    onApplyText,
    onError,
    stopDictation,
  ]);

  const toggleDictation = useCallback(() => {
    if (isDictating) stopDictation();
    else startDictation();
  }, [isDictating, startDictation, stopDictation]);

  useEffect(() => {
    return () => {
      stopDictation();
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== "inactive") {
        try {
          mr.stop();
        } catch {
          /* ignore */
        }
      }
      stopStream();
    };
  }, [stopDictation, stopStream]);

  const micBlocked = disabled || isTranscribing;

  return (
    <div
      className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-4"
      data-voice-memo-controls=""
    >
      <p className="mb-3 text-xs font-medium text-slate-600">音声メモ（任意）</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={isRecording ? "primary" : "secondary"}
          disabled={micBlocked}
          onClick={toggleRecord}
          className="text-sm"
          aria-pressed={isRecording}
        >
          {isTranscribing
            ? "文字起こし中…"
            : isRecording
              ? "録音停止"
              : "録音して文字起こし"}
        </Button>

        <Button
          type="button"
          variant="secondary"
          disabled={micBlocked}
          onClick={() => fileInputRef.current?.click()}
          className="text-sm"
        >
          音声ファイル
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.webm,.mp3,.m4a,.mp4,.wav,.ogg"
          className="hidden"
          onChange={onFileChange}
        />

        {speechAvailable ? (
          <Button
            type="button"
            variant={isDictating ? "primary" : "secondary"}
            disabled={disabled || isTranscribing}
            onClick={toggleDictation}
            className="text-sm"
            aria-pressed={isDictating}
          >
            {isDictating ? "ブラウザ入力停止" : "ブラウザ音声入力"}
          </Button>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {appleRecordingHint ? (
          <>
            <strong className="font-medium text-slate-600">iPhone / Safari では</strong>
            「録音して文字起こし」またはボイスメモなどからの
            <strong className="font-medium text-slate-600">「音声ファイル」</strong>
            を優先してください。ブラウザ音声入力は環境によって不安定なことがあります。録音・ファイルは
            OpenAI Whisper で文字起こしし、「今回メモ」に追記します（1ファイルあたり最大{" "}
            {formatMegabytes(VOICE_CLIENT_MAX_AUDIO_BYTES)}MB）。失敗時はキーボードで手入力できます。
          </>
        ) : (
          <>
            録音・ファイルは OpenAI Whisper で文字起こしし、下の「今回メモ」に追記します（1ファイルあたり最大{" "}
            {formatMegabytes(VOICE_CLIENT_MAX_AUDIO_BYTES)}MB）。失敗時はそのままキーボード入力できます。
            Safari では「音声ファイル」で共有する方法もおすすめです。
          </>
        )}
      </p>
    </div>
  );
}
