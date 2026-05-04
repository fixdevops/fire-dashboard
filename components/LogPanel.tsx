export default function LogPanel() {
  const logs = [
    "10:35:01 - WiFi Connected",
    "10:40:12 - 🔥 API TERDETEKSI",
    "10:41:00 - Pump Active"
  ]

  return (
    <div className="bg-white/70 p-4 rounded-2xl shadow mt-4">
      <h2 className="mb-2 font-semibold">Live Logs</h2>
      <div className="text-sm space-y-1">
        {logs.map((log, i) => (
          <p key={i}>{log}</p>
        ))}
      </div>
    </div>
  )
}