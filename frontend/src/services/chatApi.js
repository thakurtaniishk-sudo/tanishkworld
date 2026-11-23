
const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000";

function getToken() {
  return sessionStorage.getItem(
    "tanishkworld_token"
  );
}

function getErrorMessage(data, fallback) {
  return data?.message || fallback;
}

async function request(path, options = {}) {
  const token = getToken();

  if (!token) {
    throw new Error("LOGIN_REQUIRED");
  }

  const response = await fetch(
    `${API_URL}${path}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    }
  );

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error("Invalid server response");
  }

  if (response.status === 401) {
    throw new Error("SESSION_EXPIRED");
  }

  if (!response.ok || !data.success) {
    throw new Error(
      getErrorMessage(data, "Request failed")
    );
  }

  return data;
}

function uploadAttachments(chatId, files, { signal, onProgress } = {}) {
  const token = getToken();

  if (!token) {
    return Promise.reject(new Error("LOGIN_REQUIRED"));
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const body = new FormData();

    files.forEach((file) => body.append("files", file));
    xhr.open(
      "POST",
      `${API_URL}/api/chats/attachments?chatId=${encodeURIComponent(chatId)}`
    );
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.responseType = "json";

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      const data = xhr.response;

      if (xhr.status === 401) {
        reject(new Error("SESSION_EXPIRED"));
        return;
      }

      if (xhr.status < 200 || xhr.status >= 300 || !data?.success) {
        reject(
          new Error(
            getErrorMessage(data, "Unable to upload attachments.")
          )
        );
        return;
      }

      resolve(data);
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Unable to connect to the backend server."));
    });
    xhr.addEventListener("abort", () => {
      reject(new Error("UPLOAD_CANCELLED"));
    });

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
      } else {
        signal.addEventListener("abort", () => xhr.abort(), {
          once: true,
        });
      }
    }

    xhr.send(body);
  });
}

async function downloadAttachment(attachmentId) {
  const token = getToken();
  if (!token) throw new Error("LOGIN_REQUIRED");

  const response = await fetch(
    `${API_URL}/api/chats/attachments/${encodeURIComponent(attachmentId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (response.status === 401) {
    throw new Error("SESSION_EXPIRED");
  }

  if (!response.ok) {
    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    throw new Error(
      getErrorMessage(data, "Unable to download this attachment.")
    );
  }

  return response.blob();
}

export const chatApi = {
  getChats: () =>
    request("/api/chats"),

  createChat: () =>
    request("/api/chats", {
      method: "POST",
      body: JSON.stringify({}),
    }),

  getChat: (id) =>
    request(`/api/chats/${id}`),

  sendMessage: (id, message, attachmentIds = []) =>
    request(`/api/chats/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ message, attachmentIds }),
    }),

  uploadAttachments,

  downloadAttachment,

  deleteAttachment: (id) =>
    request(`/api/chats/attachments/${id}`, {
      method: "DELETE",
    }),

  deleteChat: (id) =>
    request(`/api/chats/${id}`, {
      method: "DELETE",
    }),
};
