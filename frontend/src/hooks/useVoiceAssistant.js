
import { useCallback, useEffect, useRef, useState } from "react";

export default function useVoiceAssistant() {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);
  const [voiceError, setVoiceError] = useState("");

  const recognitionRef = useRef(null);
  const speakingRef = useRef(false);
  const listeningRef = useRef(false);
  const onTranscriptRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    const available =
      Boolean(SpeechRecognition) &&
      "speechSynthesis" in window;

    setSupported(available);

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();

    recognition.lang = "hi-IN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      listeningRef.current = true;
      setListening(true);
      setVoiceError("");
    };

    recognition.onresult = (event) => {
      let finalText = "";

      for (
        let i = event.resultIndex;
        i < event.results.length;
        i++
      ) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript;
        }
      }

      if (finalText.trim()) {
        onTranscriptRef.current?.(finalText.trim());
      }
    };

    recognition.onerror = (event) => {
      if (event.error !== "aborted") {
        setVoiceError(
          event.error === "not-allowed"
            ? "Microphone permission denied."
            : `Speech recognition error: ${event.error}`
        );
      }
    };

    recognition.onend = () => {
      listeningRef.current = false;
      setListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onstart = null;
      recognition.abort();

      window.speechSynthesis?.cancel();
    };
  }, []);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.abort();
    } catch {
      // Recognition may already be stopped.
    }

    listeningRef.current = false;
    setListening(false);
  }, []);

  const startListening = useCallback(
    (onTranscript, language = "hi-IN") => {
      if (!recognitionRef.current) {
        setVoiceError(
          "Speech recognition is not supported in this browser."
        );
        return;
      }

      if (listeningRef.current) return;

      setVoiceError("");
      onTranscriptRef.current = onTranscript;

      recognitionRef.current.lang = language;

      try {
        recognitionRef.current.start();
      } catch (error) {
        setVoiceError(
          "Unable to start microphone. Please try again."
        );
      }
    },
    []
  );

  const stopSpeaking = useCallback(() => {
    speakingRef.current = false;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text, language = "hi-IN", onFinished) => {
      if (!("speechSynthesis" in window)) {
        onFinished?.();
        return;
      }

      window.speechSynthesis.cancel();

      const cleanText = text
        .replace(/```[\s\S]*?```/g, " Code example omitted. ")
        .replace(/[#*_`>~]/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .trim();

      if (!cleanText) {
        onFinished?.();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);

      utterance.lang = language;
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;

      const voices = window.speechSynthesis.getVoices();

      const matchingVoice = voices.find(
        (voice) =>
          voice.lang.toLowerCase() === language.toLowerCase()
      );

      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }

      speakingRef.current = true;
      setSpeaking(true);

      utterance.onend = () => {
        speakingRef.current = false;
        setSpeaking(false);
        onFinished?.();
      };

      utterance.onerror = () => {
        speakingRef.current = false;
        setSpeaking(false);
        setVoiceError("Unable to play AI voice response.");
      };

      window.speechSynthesis.speak(utterance);
    },
    []
  );

  return {
    listening,
    speaking,
    supported,
    voiceError,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  };
}
