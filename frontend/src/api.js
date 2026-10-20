export async function recognize(image) {
  const resp = await fetch("/api/recognize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image }),
  });
  let data = null;
  try {
    data = await resp.json();
  } catch {
    data = null;
  }
  if (!resp.ok) {
    const msg = (data && data.error) || `识别失败（HTTP ${resp.status}）`;
    throw new Error(msg);
  }
  return data;
}
