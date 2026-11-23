
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bot,
  Plus,
  Send,
  Trash2,
  LogOut,
  Menu,
  X,
  Sparkles,
  MessageSquare,
  Copy,
  Check,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  PhoneOff,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Table2,
  Download,
  LoaderCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

import { chatApi } from "../services/chatApi";
import useVoiceAssistant from "../hooks/useVoiceAssistant";
import "./chat.css";

const MAX_FILES_PER_MESSAGE = 5;
const MAX_FILE_SIZE_MB = Number(
  import.meta.env.VITE_ATTACHMENT_MAX_FILE_SIZE_MB || 10
);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set([
  "pdf", "docx", "txt", "md", "xlsx", "csv",
  "png", "jpg", "jpeg", "webp",
]);

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAttachmentStatus(attachment) {
  if (attachment.status === "uploading") {
    return `Uploading ${attachment.progress || 0}%`;
  }
  if (attachment.status === "queued") return "Ready to upload";
  if (attachment.processingStatus === "no_text") {
    return "No readable text";
  }
  if (attachment.processingStatus === "vision_unavailable") {
    return "Image · vision not configured";
  }
  if (attachment.processingStatus === "vision_ready") {
    return "Image · vision ready";
  }
  return attachment.attachmentId || attachment._id
    ? "Uploaded · ready to use"
    : "Ready to upload";
}

function AttachmentCard({
  attachment,
  onRemove,
  onDownload,
  onCancelUpload,
}) {
  const [previewUrl, setPreviewUrl] = useState("");
  const name = attachment.originalName || attachment.file?.name || "Attachment";
  const mimeType = attachment.file?.type || attachment.mimeType;
  const isImage =
    mimeType?.startsWith("image/") ||
    /\.(png|jpe?g|webp)$/i.test(name);
  const extension = name.split(".").pop()?.toUpperCase() || "FILE";
  const size = attachment.file?.size ?? attachment.fileSize ?? 0;
  const isUploading = attachment.status === "uploading";

  useEffect(() => {
    if (!attachment.file || !isImage) return undefined;
    const url = URL.createObjectURL(attachment.file);
    const frame = requestAnimationFrame(() => setPreviewUrl(url));
    return () => {
      cancelAnimationFrame(frame);
      URL.revokeObjectURL(url);
    };
  }, [attachment.file, isImage]);

  return (
    <div className={`tw-attachment-card${isUploading ? " is-uploading" : ""}`}>
      {previewUrl ? (
        <img className="tw-attachment-thumb" src={previewUrl} alt="" />
      ) : (
        <div className={`tw-attachment-icon ${isImage ? "image" : ""}`}>
          {isImage ? (
            <ImageIcon size={19} />
          ) : ["XLSX", "CSV"].includes(extension) ? (
            <Table2 size={19} />
          ) : (
            <FileText size={19} />
          )}
        </div>
      )}

      <div className="tw-attachment-details">
        <span className="tw-attachment-name" title={name}>{name}</span>
        <span className="tw-attachment-meta">
          {extension} <span>·</span> {formatFileSize(size)}
        </span>
        <span className="tw-attachment-status">
          {isUploading && <LoaderCircle size={12} className="tw-upload-spinner" />}
          {getAttachmentStatus(attachment)}
        </span>
        {isUploading && (
          <span className="tw-upload-progress">
            <span style={{ width: `${attachment.progress || 0}%` }} />
          </span>
        )}
      </div>

      {onDownload && (attachment.attachmentId || attachment._id) && (
        <button
          type="button"
          className="tw-attachment-action"
          onClick={() => onDownload(attachment)}
          aria-label={`Download ${name}`}
          title="Download attachment"
        >
          <Download size={15} />
        </button>
      )}
      {onCancelUpload && isUploading ? (
        <button
          type="button"
          className="tw-attachment-remove"
          onClick={onCancelUpload}
          aria-label="Cancel upload"
          title="Cancel upload"
        >
          <X size={15} />
        </button>
      ) : onRemove ? (
        <button
          type="button"
          className="tw-attachment-remove"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          title="Remove attachment"
        >
          <X size={15} />
        </button>
      ) : null}
    </div>
  );
}

function AIOrb({ active = false, voiceActive = false }) {
  return (
    <div
      className={`tw-ai-orb${active ? " is-active" : ""}${
        voiceActive ? " is-voice-active" : ""
      }`}
      aria-hidden="true"
    >
      <span className="tw-orb-particle particle-one" />
      <span className="tw-orb-particle particle-two" />
      <span className="tw-orb-particle particle-three" />
      <span className="tw-orb-particle particle-four" />
      <div className="tw-orb-ring tw-orb-ring-one" />
      <div className="tw-orb-ring tw-orb-ring-two" />
      <div className="tw-orb-ring tw-orb-ring-three" />
      <div className="tw-orb-sphere">
        <span className="tw-orb-highlight" />
        <Sparkles size={30} strokeWidth={1.5} />
      </div>
    </div>
  );
}

function getUserStorageKey() {
  const rawUser = sessionStorage.getItem("tanishkworld_user");

  try {
    const user = JSON.parse(rawUser || "{}");
    const userId =
      user._id || user.id || user.userId || user.email;

    return userId
      ? `tanishkworld_active_chat_${userId}`
      : null;
  } catch {
    return null;
  }
}

export default function Chat() {
  const navigate = useNavigate();

  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [error, setError] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);

  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState("hi-IN");
  const [voiceMuted, setVoiceMuted] = useState(false);

  const bottomRef = useRef(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(false);
  const activeIdRef = useRef(null);
  const voiceModeRef = useRef(false);
  const voiceMutedRef = useRef(false);
  const voiceLanguageRef = useRef("hi-IN");
  const voiceBusyRef = useRef(false);
  const voiceSessionRef = useRef(0);
  const lastTranscriptRef = useRef("");
  const lastTranscriptTimeRef = useRef(0);
  const fileInputRef = useRef(null);
  const uploadAbortRef = useRef(null);
  const dragDepthRef = useRef(0);

  const storageKey = getUserStorageKey();

  const {
    listening,
    speaking,
    supported,
    voiceError,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  } = useVoiceAssistant();

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    voiceLanguageRef.current = voiceLanguage;
  }, [voiceLanguage]);

  function stopVoiceMode() {
    console.log("[VOICE] Conversation stopped");

    voiceSessionRef.current += 1;
    voiceModeRef.current = false;
    setVoiceMode(false);

    stopListening();
    stopSpeaking();
  }

  function handleAuthError(err) {
    if (
      err.message === "LOGIN_REQUIRED" ||
      err.message === "SESSION_EXPIRED"
    ) {
      stopVoiceMode();

      sessionStorage.removeItem("tanishkworld_token");
      sessionStorage.removeItem("tanishkworld_user");

      navigate("/login", { replace: true });
      return true;
    }

    return false;
  }

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function loadHistory() {
      try {
        const data = await chatApi.getChats();
        if (cancelled) return;

        const savedChats = data.chats || [];
        setChats(savedChats);

        const lastChatId = storageKey
          ? localStorage.getItem(storageKey)
          : null;

        if (
          lastChatId &&
          savedChats.some((chat) => chat._id === lastChatId)
        ) {
          const chatData = await chatApi.getChat(lastChatId);
          if (cancelled) return;

          setActiveId(lastChatId);
          activeIdRef.current = lastChatId;
          setMessages(chatData.chat.messages || []);
        } else if (lastChatId && storageKey) {
          localStorage.removeItem(storageKey);
        }
      } catch (err) {
        if (cancelled) return;

        if (!handleAuthError(err)) {
          setError(
            err.message || "Failed to load chat history"
          );
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      voiceModeRef.current = false;
      voiceSessionRef.current += 1;
      uploadAbortRef.current?.abort();
      stopListening();
      stopSpeaking();
    };
  }, [navigate, storageKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  function newChat() {
    if (
      busyRef.current ||
      voiceBusyRef.current ||
      historyLoading
    ) {
      return;
    }

    stopVoiceMode();
    discardPendingAttachments();
    setActiveId(null);
    activeIdRef.current = null;
    setMessages([]);
    setInput("");
    setError("");
        setPendingAttachments([]);
    setSidebarOpen(false);

    if (storageKey) localStorage.removeItem(storageKey);
  }

  async function openChat(id) {
    if (
      busyRef.current ||
      voiceBusyRef.current ||
      historyLoading
    ) {
      return;
    }

    stopVoiceMode();
    busyRef.current = true;
    setLoading(true);
    setError("");

    try {
      const data = await chatApi.getChat(id);
      if (!mountedRef.current) return;

      setActiveId(id);
      activeIdRef.current = id;
      setMessages(data.chat.messages || []);
      discardPendingAttachments();
      setSidebarOpen(false);

      if (storageKey) {
        localStorage.setItem(storageKey, id);
      }
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(err.message || "Unable to open chat");
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }

  async function deleteChat(id) {
    if (
      busyRef.current ||
      voiceBusyRef.current ||
      historyLoading
    ) {
      return;
    }

    if (
      !window.confirm(
        "Delete this conversation permanently?"
      )
    ) {
      return;
    }

    stopVoiceMode();
    busyRef.current = true;
    setLoading(true);
    setError("");

    try {
      await chatApi.deleteChat(id);
      if (!mountedRef.current) return;

      setChats((prev) =>
        prev.filter((chat) => chat._id !== id)
      );

      if (activeIdRef.current === id) {
        setActiveId(null);
        activeIdRef.current = null;
        setMessages([]);
          setPendingAttachments([]);
      }

      if (
        storageKey &&
        localStorage.getItem(storageKey) === id
      ) {
        localStorage.removeItem(storageKey);
      }
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(err.message || "Unable to delete chat");
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }

  function resumeVoiceListening(sessionId) {
    if (
      !mountedRef.current ||
      !voiceModeRef.current ||
      voiceSessionRef.current !== sessionId ||
      busyRef.current
    ) {
      return;
    }

    console.log("[VOICE] Listening again");

    startListening(
      handleVoiceTranscript,
      voiceLanguageRef.current
    );
  }

  async function sendChatMessage(
    text,
    isVoice = false,
    includeAttachments = false
  ) {
    const message = text?.trim();
    const selectedAttachments = includeAttachments
      ? pendingAttachments
      : [];

    if (
      (!message && selectedAttachments.length === 0) ||
      busyRef.current ||
      historyLoading
    ) {
      return;
    }

    const token = sessionStorage.getItem(
      "tanishkworld_token"
    );

    if (!token) {
      stopVoiceMode();
      navigate("/login", { replace: true });
      return;
    }

    const sessionId = voiceSessionRef.current;
    busyRef.current = true;
    voiceBusyRef.current = isVoice;
    setLoading(true);
    setError("");

    let chatId = activeIdRef.current;
    let responseForSpeech = "";
    let shouldResumeListening = false;
    let attachmentIds = [
      ...new Set(
        selectedAttachments
          .map((item) => item.attachmentId)
          .filter(Boolean)
      ),
    ];

    const temporaryMessage = {
      _id: crypto.randomUUID(),
      role: "user",
      content: message || "Please review the attached file(s).",
      attachments: selectedAttachments.map((item) => ({
        attachmentId: item.attachmentId || item._id,
        originalName: item.file?.name || item.originalName,
        mimeType: item.file?.type || item.mimeType,
        fileSize: item.file?.size ?? item.fileSize,
        processingStatus: item.processingStatus,
      })),
    };

    setMessages((prev) => [...prev, temporaryMessage]);

    try {
      if (!chatId) {
        const created = await chatApi.createChat();
        chatId = created.chat._id;

        if (!mountedRef.current) return;

        setActiveId(chatId);
        activeIdRef.current = chatId;

        setChats((prev) => [
          created.chat,
          ...prev.filter((chat) => chat._id !== chatId),
        ]);

        if (storageKey) {
          localStorage.setItem(storageKey, chatId);
        }
      }

      const filesToUpload = selectedAttachments.filter(
        (item) => !item.attachmentId
      );

      if (filesToUpload.length > 0) {
        const controller = new AbortController();
        uploadAbortRef.current = controller;
        const selectedKeys = new Set(
          filesToUpload.map((item) => item.key)
        );

        setPendingAttachments((previous) =>
          previous.map((item) =>
            selectedKeys.has(item.key)
              ? { ...item, status: "uploading", progress: 0 }
              : item
          )
        );

        const result = await chatApi.uploadAttachments(
          chatId,
          filesToUpload.map((item) => item.file),
          {
            signal: controller.signal,
            onProgress: (progress) => {
              setPendingAttachments((previous) =>
                previous.map((item) =>
                  selectedKeys.has(item.key)
                    ? { ...item, progress }
                    : item
                )
              );
            },
          }
        );
        uploadAbortRef.current = null;

        const uploaded = result.attachments || [];
        if (uploaded.length !== filesToUpload.length) {
          throw new Error("The server did not confirm every attachment.");
        }

        const uploadedByKey = new Map();
        filesToUpload.forEach((item, index) => {
          uploadedByKey.set(item.key, uploaded[index]);
        });

        setPendingAttachments((previous) =>
          {
            const seenIds = new Set();
            return previous
              .map((item) => {
                const uploadedItem = uploadedByKey.get(item.key);
                return uploadedItem
                  ? {
                      ...item,
                      ...uploadedItem,
                      attachmentId: uploadedItem._id,
                      status: "ready",
                      progress: 100,
                    }
                  : item;
              })
              .filter((item) => {
                if (!item.attachmentId) return true;
                if (seenIds.has(item.attachmentId)) return false;
                seenIds.add(item.attachmentId);
                return true;
              });
          }
        );
        attachmentIds = [
          ...new Set([
            ...attachmentIds,
            ...uploaded.map((item) => item._id),
          ]),
        ];
      }

      console.log("[CHAT] Sending message", {
        isVoice,
        chatId,
      });

      const data = await chatApi.sendMessage(
        chatId,
        message || "Please review the attached file(s).",
        attachmentIds
      );

      if (!mountedRef.current) return;

      const updatedChat = data.chat;

      setMessages(updatedChat.messages || []);
      if (includeAttachments) setPendingAttachments([]);
      if (!isVoice) setInput("");

      setChats((prev) => [
        updatedChat,
        ...prev.filter(
          (chat) => chat._id !== updatedChat._id
        ),
      ]);

      responseForSpeech =
        typeof data.reply === "string"
          ? data.reply
          : "";

      console.log("[VOICE DEBUG]", {
        isVoice,
        voiceMode: voiceModeRef.current,
        muted: voiceMutedRef.current,
        language: voiceLanguageRef.current,
        replyLength: responseForSpeech.length,
      });

      shouldResumeListening =
        isVoice &&
        voiceModeRef.current &&
        voiceSessionRef.current === sessionId;
    } catch (err) {
      if (handleAuthError(err)) return;

      setPendingAttachments((previous) =>
        previous.map((item) =>
          item.status === "uploading"
            ? { ...item, status: "queued", progress: 0 }
            : item
        )
      );
      console.error("[CHAT] Message failed:", err);
      setError(
        err.message === "UPLOAD_CANCELLED"
          ? "Upload cancelled. Your selected files are ready to try again."
          : err.message ||
          "Something went wrong. Please try again."
      );

      if (chatId) {
        try {
          const [chatData, listData] = await Promise.all([
            chatApi.getChat(chatId),
            chatApi.getChats(),
          ]);

          if (!mountedRef.current) return;

          setMessages(chatData.chat.messages || []);
          setChats(listData.chats || []);

          const savedUserMessage = (
            chatData.chat.messages || []
          ).find(
            (item) =>
              item.role === "user" &&
              item.content === (message || "Please review the attached file(s).")
          );

          if (savedUserMessage) {
            const savedIds = new Set(
              (savedUserMessage.attachments || []).map((item) =>
                String(item.attachmentId)
              )
            );
            if (
              attachmentIds.length > 0 &&
              attachmentIds.every((id) => savedIds.has(String(id)))
            ) {
              setPendingAttachments([]);
              if (!isVoice) setInput("");
            }
            setError(
              "Message was saved. Check the conversation before retrying."
            );
          } else if (!isVoice) {
            setInput(message);
          }
        } catch {
          setMessages((prev) =>
            prev.filter(
              (item) =>
                item._id !== temporaryMessage._id
            )
          );

          if (!isVoice) setInput(message);
        }
      } else {
        setMessages((prev) =>
          prev.filter(
            (item) =>
              item._id !== temporaryMessage._id
          )
        );

        if (!isVoice) setInput(message);
      }
    } finally {
      uploadAbortRef.current = null;
      busyRef.current = false;
      voiceBusyRef.current = false;

      if (mountedRef.current) setLoading(false);
    }

    // IMPORTANT:
    // Speak after the request has finished and
    // the busy flag has been released.
    if (
      shouldResumeListening &&
      mountedRef.current &&
      voiceModeRef.current &&
      voiceSessionRef.current === sessionId
    ) {
      if (
        !voiceMutedRef.current &&
        responseForSpeech.trim()
      ) {
        console.log("[VOICE] Starting automatic TTS");

        stopListening();

        speak(
          responseForSpeech,
          voiceLanguageRef.current,
          () => {
            console.log("[VOICE] TTS completed");
            resumeVoiceListening(sessionId);
          }
        );
      } else {
        resumeVoiceListening(sessionId);
      }
    }
  }

  function sendMessage(event) {
    event.preventDefault();

    const text = input.trim();

    if (
      (!text && pendingAttachments.length === 0) ||
      busyRef.current ||
      historyLoading
    ) {
      return;
    }

    sendChatMessage(text, false, true);
  }

  function addFiles(fileList) {
    if (loading || historyLoading) return;

    const incoming = Array.from(fileList || []);
    const accepted = [];
    const problems = [];
    const selected = new Set(
      pendingAttachments.map((item) => item.key)
    );

    for (const file of incoming) {
      const extension = file.name.split(".").pop()?.toLowerCase();
      const key = `${file.name}:${file.size}:${file.lastModified}`;

      if (!SUPPORTED_EXTENSIONS.has(extension)) {
        problems.push(`${file.name}: unsupported file type.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        problems.push(
          `${file.name}: maximum size is ${MAX_FILE_SIZE_MB} MB.`
        );
        continue;
      }
      if (file.size === 0) {
        problems.push(`${file.name}: empty files cannot be attached.`);
        continue;
      }
      if (selected.has(key)) continue;
      if (
        pendingAttachments.length + accepted.length >=
        MAX_FILES_PER_MESSAGE
      ) {
        problems.push(`You can attach up to ${MAX_FILES_PER_MESSAGE} files per message.`);
        break;
      }

      selected.add(key);
      accepted.push({
        key,
        file,
        status: "queued",
        progress: 0,
      });
    }

    if (problems.length > 0) {
      setError(problems.join(" "));
    } else if (accepted.length > 0) {
      setError("");
    }

    if (accepted.length > 0) {
      setPendingAttachments((previous) => [...previous, ...accepted]);
    }
  }

  function discardPendingAttachments() {
    const uploadedIds = pendingAttachments
      .map((item) => item.attachmentId)
      .filter(Boolean);

    setPendingAttachments([]);

    if (uploadedIds.length > 0) {
      Promise.allSettled(
        uploadedIds.map((id) => chatApi.deleteAttachment(id))
      ).then((results) => {
        const failed = results.find(
          (result) => result.status === "rejected"
        );
        if (failed && !handleAuthError(failed.reason)) {
          setError(
            failed.reason.message ||
              "Some unused attachments could not be removed."
          );
        }
      });
    }
  }

  async function removePendingAttachment(key) {
    const attachment = pendingAttachments.find((item) => item.key === key);
    if (!attachment) return;

    if (attachment.attachmentId) {
      try {
        await chatApi.deleteAttachment(attachment.attachmentId);
      } catch (err) {
        if (handleAuthError(err)) return;
        setError(err.message || "Unable to remove this attachment.");
        return;
      }
    }

    setPendingAttachments((previous) =>
      previous.filter((item) => item.key !== key)
    );
    setError("");
  }

  function cancelAttachmentUpload() {
    uploadAbortRef.current?.abort();
    setPendingAttachments((previous) =>
      previous.map((item) =>
        item.status === "uploading"
          ? { ...item, status: "queued", progress: 0 }
          : item
      )
    );
  }

  async function downloadAttachment(attachment) {
    const id = attachment.attachmentId || attachment._id;
    if (!id) return;

    try {
      const blob = await chatApi.downloadAttachment(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.originalName || "attachment";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(err.message || "Unable to download this attachment.");
      }
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    addFiles(event.dataTransfer.files);
  }

  function handleVoiceTranscript(text) {
    const message = text?.trim();

    if (
      !message ||
      !voiceModeRef.current ||
      busyRef.current
    ) {
      return;
    }

    // Prevent immediate duplicate recognition events.
    const now = Date.now();

    if (
      lastTranscriptRef.current === message &&
      now - lastTranscriptTimeRef.current < 1500
    ) {
      return;
    }

    lastTranscriptRef.current = message;
    lastTranscriptTimeRef.current = now;

    console.log("[VOICE] Recognized:", message);

    stopListening();
    sendVoiceMessage(message);
  }

  async function sendVoiceMessage(text) {
    if (
      !voiceModeRef.current ||
      voiceBusyRef.current ||
      busyRef.current
    ) {
      return;
    }

    await sendChatMessage(text, true);
  }

  function startVoiceMode() {
    if (!supported) {
      setError(
        "Voice mode is not supported in this browser."
      );
      return;
    }

    if (busyRef.current || historyLoading) return;

    voiceSessionRef.current += 1;
    voiceModeRef.current = true;
    setVoiceMode(true);
    setError("");

    stopSpeaking();

    console.log("[VOICE] Starting conversation");

    startListening(
      handleVoiceTranscript,
      voiceLanguageRef.current
    );
  }

  function toggleVoiceMute() {
    const nextMuted = !voiceMutedRef.current;

    voiceMutedRef.current = nextMuted;
    setVoiceMuted(nextMuted);

    if (nextMuted) {
      stopSpeaking();

      if (
        voiceModeRef.current &&
        !busyRef.current
      ) {
        resumeVoiceListening(
          voiceSessionRef.current
        );
      }
    }
  }

  function listenToMessage(content) {
    if (!content?.trim()) return;

    console.log("[VOICE] Manual Listen clicked", {
      length: content.length,
      language: voiceLanguageRef.current,
    });

    stopListening();

    const sessionId = voiceSessionRef.current;

    speak(
      content,
      voiceLanguageRef.current,
      () => {
        if (voiceModeRef.current) {
          resumeVoiceListening(sessionId);
        }
      }
    );
  }

  async function copyMessage(content, id) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);

      setTimeout(() => {
        if (mountedRef.current) {
          setCopiedId(null);
        }
      }, 1500);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  }

  function logout() {
    uploadAbortRef.current?.abort();
    stopVoiceMode();
    discardPendingAttachments();

    if (storageKey) {
      localStorage.removeItem(storageKey);
    }

    sessionStorage.removeItem("tanishkworld_token");
    sessionStorage.removeItem("tanishkworld_user");

    navigate("/login", { replace: true });
  }

  return (
    <div
      className={`tw-chat-app${isDraggingFiles ? " is-dragging-files" : ""}${
        loading ? " is-generating" : ""
      }${voiceMode ? " is-voice-active" : ""}`}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        dragDepthRef.current += 1;
        setIsDraggingFiles(true);
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
        }
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepthRef.current -= 1;
        if (dragDepthRef.current <= 0) {
          dragDepthRef.current = 0;
          setIsDraggingFiles(false);
        }
      }}
      onDrop={handleDrop}
    >
      {isDraggingFiles && (
        <div className="tw-drop-overlay" aria-live="polite">
          <div className="tw-drop-card">
            <Paperclip size={28} />
            <strong>Drop files to attach</strong>
            <span>PDF, DOCX, TXT, MD, XLSX, CSV, PNG, JPG or WEBP</span>
          </div>
        </div>
      )}
      <div className="tw-ambient" aria-hidden="true">
        <span className="tw-ambient-orb ambient-orb-violet" />
        <span className="tw-ambient-orb ambient-orb-blue" />
        <span className="tw-ambient-orb ambient-orb-cyan" />
        <span className="tw-ambient-stars" />
        <span className="tw-ambient-grid" />
      </div>
      {/* SIDEBAR */}
      <aside
        className={`tw-sidebar ${
          sidebarOpen ? "open" : ""
        }`}
      >
        <div className="tw-sidebar-header">
          <div className="tw-logo">
            <Sparkles size={23} />
            <span>TanishkWorld AI</span>
          </div>

          <button
            className="tw-mobile-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        </div>

        <button
          className="tw-new-chat"
          onClick={newChat}
          disabled={loading || historyLoading}
        >
          <Plus size={18} />
          New Chat
        </button>

        <div className="tw-history-label">
          Recent conversations
        </div>

        <div className="tw-history">
          {historyLoading ? (
            <p className="tw-no-chats">
              Loading conversations...
            </p>
          ) : chats.length === 0 ? (
            <p className="tw-no-chats">
              No conversations yet.
            </p>
          ) : (
            chats.map((chat) => (
              <div
                key={chat._id}
                className={`tw-history-item ${
                  activeId === chat._id
                    ? "active"
                    : ""
                }`}
              >
                <button
                  className="tw-history-open"
                  onClick={() => openChat(chat._id)}
                  disabled={loading}
                >
                  <MessageSquare size={16} />
                  <span>
                    {chat.title || "New Chat"}
                  </span>
                </button>

                <button
                  className="tw-delete-chat"
                  onClick={() => deleteChat(chat._id)}
                  disabled={loading}
                  aria-label={`Delete ${chat.title}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="tw-sidebar-footer">
          <span>
            ✨ Your personal AI assistant
          </span>

          <button
            className="tw-logout"
            onClick={logout}
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="tw-main">
        <header className="tw-topbar">
          <div className="tw-topbar-left">
            <button
              className="tw-menu"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu size={22} />
            </button>

            <span>TanishkWorld AI</span>
          </div>

          <div className="tw-status">
            <span className="tw-status-dot" />
            AI Assistant
          </div>
        </header>

        <section className="tw-chat-body">
          {historyLoading ? (
            <div className="tw-welcome">
              <AIOrb active />

              <h1>
                Loading{" "}
                <span>TanishkWorld AI</span>
              </h1>

              <p>
                Restoring your conversations...
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="tw-welcome">
              <AIOrb
                active={loading}
                voiceActive={voiceMode && (listening || speaking)}
              />

              <h1>
                Welcome to{" "}
                <span>TanishkWorld AI</span>
              </h1>

              <p>
                Your intelligent AI assistant
                is ready. Ask questions,
                explore ideas and create
                something amazing.
              </p>

              <div className="tw-suggestions">
                {[
                  "Explain React hooks in Hinglish",
                  "Help me learn Node.js",
                  "Write a professional email",
                  "Suggest a full-stack project",
                ].map((item) => (
                  <button
                    key={item}
                    onClick={() => setInput(item)}
                    disabled={loading}
                  >
                    <Sparkles size={15} />
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="tw-messages">
              {messages.map((message) => (
                <div
                  key={message._id}
                  className={`tw-message ${
                    message.role
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="tw-avatar">
                      <Bot size={19} />
                    </div>
                  )}

                  <div className="tw-message-content">
                    {message.attachments?.length > 0 && (
                      <div className="tw-message-attachments">
                        {message.attachments.map((attachment) => (
                          <AttachmentCard
                            key={attachment.attachmentId || attachment.originalName}
                            attachment={attachment}
                            onDownload={downloadAttachment}
                          />
                        ))}
                      </div>
                    )}
                    <div className="tw-bubble">
                      {message.role ===
                      "assistant" ? (
                        <ReactMarkdown skipHtml>
                          {message.content}
                        </ReactMarkdown>
                      ) : (
                        message.content
                      )}
                    </div>

                    {message.role ===
                      "assistant" && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "14px",
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          className="tw-copy"
                          onClick={() =>
                            copyMessage(
                              message.content,
                              message._id
                            )
                          }
                        >
                          {copiedId ===
                          message._id ? (
                            <Check size={15} />
                          ) : (
                            <Copy size={15} />
                          )}

                          {copiedId ===
                          message._id
                            ? "Copied"
                            : "Copy"}
                        </button>

                        <button
                          type="button"
                          className="tw-copy"
                          onClick={() =>
                            listenToMessage(
                              message.content
                            )
                          }
                          title="Listen to AI response"
                        >
                          <Volume2 size={15} />
                          Listen
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="tw-message assistant">
                  <div className="tw-avatar">
                    <Bot size={19} />
                  </div>

                  <div className="tw-typing">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </section>

        {/* COMPOSER */}
        <div className="tw-composer-area">
          {error && (
            <p
              role="alert"
              style={{
                color: "#f87171",
                marginBottom: "10px",
                fontSize: "13px",
              }}
            >
              {error}
            </p>
          )}

          {voiceMode && (
            <div className="tw-voice-panel">
              <div className="tw-voice-status">
                <span className="tw-voice-pulse" />

                {listening
                  ? "Listening..."
                  : speaking
                  ? "TanishkWorld AI is speaking..."
                  : loading
                  ? "Thinking..."
                  : "Voice mode active"}
              </div>

              <select
                value={voiceLanguage}
                onChange={(event) => {
                  const language =
                    event.target.value;

                  setVoiceLanguage(language);
                  voiceLanguageRef.current =
                    language;
                }}
                disabled={
                  listening ||
                  speaking ||
                  loading
                }
              >
                <option value="hi-IN">
                  Hindi / Hinglish
                </option>
                <option value="en-IN">
                  English (India)
                </option>
                <option value="en-US">
                  English (US)
                </option>
              </select>

              <button
                type="button"
                onClick={toggleVoiceMute}
                title={
                  voiceMuted
                    ? "Unmute AI"
                    : "Mute AI"
                }
              >
                {voiceMuted ? (
                  <VolumeX size={18} />
                ) : (
                  <Volume2 size={18} />
                )}
              </button>

              <button
                type="button"
                onClick={stopVoiceMode}
                title="End Voice Conversation"
              >
                <PhoneOff size={18} />
              </button>
            </div>
          )}

          {voiceError && (
            <p
              role="alert"
              className="tw-voice-error"
            >
              {voiceError}
            </p>
          )}

          {pendingAttachments.length > 0 && (
            <div className="tw-attachment-list" aria-label="Selected attachments">
              {pendingAttachments.map((attachment) => (
                <AttachmentCard
                  key={attachment.key}
                  attachment={attachment}
                  onRemove={
                    loading
                      ? undefined
                      : () => removePendingAttachment(attachment.key)
                  }
                  onCancelUpload={
                    attachment.status === "uploading"
                      ? cancelAttachmentUpload
                      : undefined
                  }
                />
              ))}
            </div>
          )}

          <input
            ref={fileInputRef}
            className="tw-file-input"
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md,.xlsx,.csv,.png,.jpg,.jpeg,.webp"
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />

          <form
            className="tw-composer"
            onSubmit={sendMessage}
          >
            <button
              type="button"
              className="tw-attach-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || historyLoading}
              aria-label="Attach files"
              title={`Attach up to ${MAX_FILES_PER_MESSAGE} files (max ${MAX_FILE_SIZE_MB} MB each)`}
            >
              <Paperclip size={19} />
            </button>

            <button
              type="button"
              className="tw-voice-button"
              onClick={
                voiceMode
                  ? stopVoiceMode
                  : startVoiceMode
              }
              disabled={
                historyLoading ||
                (!voiceMode && loading)
              }
              title={
                voiceMode
                  ? "Stop Voice Mode"
                  : "Start Voice Conversation"
              }
            >
              {voiceMode ? (
                <MicOff size={20} />
              ) : (
                <Mic size={20} />
              )}
            </button>

            <textarea
              value={input}
              onChange={(event) =>
                setInput(event.target.value)
              }
              placeholder="Message TanishkWorld AI..."
              rows={1}
              maxLength={4000}
              disabled={
                loading || historyLoading
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />

            <button
              type="submit"
              disabled={
                loading ||
                historyLoading ||
                (!input.trim() && pendingAttachments.length === 0)
              }
              aria-label="Send message"
            >
              <Send size={19} />
            </button>
          </form>

          <p className="tw-disclaimer">
            TanishkWorld AI can make mistakes.
            Check important information.
          </p>
        </div>
      </main>

      {sidebarOpen && (
        <button
          className="tw-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      )}
    </div>
  );
}
