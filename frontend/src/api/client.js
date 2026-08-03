const getToken = () => localStorage.getItem("token");

const request = async (method, path, body = null, retry = true) => {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: "include", // Cookie'leri gönder
    body: body ? JSON.stringify(body) : null,
  });

  if (res.status === 204) return null;

  const data = await res.json();

  // Access Token süresi dolmuş → refresh dene
  if (res.status === 401 && retry && path !== "/auth/refresh") {
    try {
      const refreshData = await request("POST", "/auth/refresh", null, false);
      if (refreshData?.token) {
        localStorage.setItem("token", refreshData.token);
        // Orijinal isteği tekrar at
        return request(method, path, body, false);
      }
    } catch {
      // Refresh başarısız → çıkış yap
      localStorage.clear();
      location.reload();
    }
  }

  if (!res.ok) {
    const err = new Error(data.error || "Bir hata oluştu.");
    err.status  = res.status;
    err.details = data;
    throw err;
  }

  return data;
};

export const client = {
  get:    (path)        => request("GET",    path),
  post:   (path, body)  => request("POST",   path, body),
  put:    (path, body)  => request("PUT",    path, body),
  delete: (path)        => request("DELETE", path),
};