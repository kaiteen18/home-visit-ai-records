"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

type Props = {
  disabled?: boolean;
  /** 文字起こし結果を「今回メモ」へ反映（既に入力があるときは改行で追記） */
  onApplyText: (text: string) => void;
  onError: (message: string) => void;
  onBusyChange?: (busy: boolean) => void;
};

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

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const uploadBlob = useCallback(
    async (blob: Blob, filename: string) => {
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
        onApplyText(text);
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
      if (t) onApplyText(t);
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

  const speechAvailable = typeof window !== "undefined" && Boolean(getSpeechRecognitionCtor());
  const micBlocked = disabled || isTranscribing;

  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-4">
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
        録音・ファイルは OpenAI Whisper で文字起こしし、下の「今回メモ」に追記します。失敗時はそのままキーボード入力できます。
        Safari では録音形式が異なることがあります。その場合は「音声ファイル」で共有してください。
      </p>
    </div>
  );
}
