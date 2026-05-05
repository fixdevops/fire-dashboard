"use client"

import { useEffect, useState, useRef, useMemo } from "react"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type RtStatus = "connecting" | "connected" | "error"

type LogRow = {
  id: string
  created_at: string
  flame: boolean | null
  relay: boolean | null
  angle: number | null
}

function formatLogTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  } catch {
    return iso
  }
}

function buildLogLine(d: Pick<LogRow, "flame" | "relay" | "angle">) {
  const head = d.flame ? "Api terdeteksi" : "Pemantauan"
  const ang = d.angle ?? "—"
  const pump = d.relay ? "pompa ON" : "pompa OFF"
  return `${head} · ${ang}° · ${pump}`
}

/** Jeda data fire_logs > ini dianggap ESP/WiFi putus (ESP kirim ~1×/detik). */
const DEVICE_OFFLINE_AFTER_MS = 12_000

type DeviceWifiStatus = "unknown" | "online" | "offline"

export default function Page() {
  const [alarmPlayed, setAlarmPlayed] = useState(false)
  const [angle, setAngle] = useState(90)
  const [relay, setRelay] = useState(false)
  const [fire, setFire] = useState(false)
  const [rtStatus, setRtStatus] = useState<RtStatus>("connecting")
  const [logs, setLogs] = useState<LogRow[]>([])
  const [tick, setTick] = useState(0)
  const [wifiResetBusy, setWifiResetBusy] = useState(false)
  const [wifiResetMsg, setWifiResetMsg] = useState<string | null>(null)
  const [lastDeviceLogAt, setLastDeviceLogAt] = useState<string | null>(null)
  const mountedRef = useRef(true)

  // 🔊 AUDIO FIX (ANTI BUG)
  const alarmRef = useRef<HTMLAudioElement | null>(null)

  // 🔥 TAMBAHAN (TIDAK MENGUBAH UI)
  const updateControl = async (data: Record<string, unknown>) => {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/control?id=eq.1`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          ...data,
          updated_at: new Date().toISOString(),
        }),
      }
    )
    return res.ok
  }

  const bumpLastSeen = (createdAt: string | undefined) => {
    if (createdAt) setLastDeviceLogAt(createdAt)
  }

  const deviceWifiStatus: DeviceWifiStatus = useMemo(() => {
    if (!lastDeviceLogAt) return "unknown"
    const age = Date.now() - new Date(lastDeviceLogAt).getTime()
    if (age < DEVICE_OFFLINE_AFTER_MS) return "online"
    return "offline"
  }, [lastDeviceLogAt, tick])

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 2000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {

    let channel: any

    // 🔊 INIT AUDIO
    if (!alarmRef.current) {
      alarmRef.current = new Audio("/apiapi.mp3")
      alarmRef.current.loop = true
    }

    // 🔔 REQUEST NOTIF
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission()
    }

    const fetchInitialData = async () => {
      const { data, error } = await supabase
        .from("fire_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)

      if (error) {
        console.log("INIT ERROR:", error)
        if (mountedRef.current) setRtStatus("error")
        return
      }

      const d = data?.[0]
      if (d) {
        setAngle(d.angle ?? 90)
        setRelay(d.relay ?? false)
        setFire(d.flame ?? false)
        bumpLastSeen(d.created_at as string | undefined)
      }
    }

    const fetchRecentLogs = async () => {
      const { data, error } = await supabase
        .from("fire_logs")
        .select("id, created_at, flame, relay, angle")
        .order("created_at", { ascending: false })
        .limit(30)

      if (error) {
        console.log("LOGS ERROR:", error)
        return
      }
      if (data && mountedRef.current) {
        setLogs(data as LogRow[])
        const first = data[0] as LogRow | undefined
        if (first?.created_at) bumpLastSeen(first.created_at)
      }
    }

    fetchInitialData()
    fetchRecentLogs()

    const handleRealtime = (payload: any) => {
      console.log("REALTIME:", payload)

      const d = payload.new || payload.old
      if (!d) return

      setAngle(d.angle ?? 90)
      setRelay(d.relay ?? false)
      setFire(d.flame ?? false)
      bumpLastSeen(d.created_at as string | undefined)

      if (payload.eventType === "INSERT" && d.id && d.created_at) {
        const row: LogRow = {
          id: d.id,
          created_at: d.created_at,
          flame: d.flame ?? null,
          relay: d.relay ?? null,
          angle: d.angle ?? null,
        }
        setLogs((prev) => {
          if (prev.some((p) => p.id === row.id)) return prev
          return [row, ...prev].slice(0, 40)
        })
      }
    }

    channel = supabase
      .channel("fire-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "fire_logs"
        },
        handleRealtime
      )
      .subscribe((status, err) => {
        console.log("STATUS:", status, err)
        if (!mountedRef.current) return
        if (status === "SUBSCRIBED") setRtStatus("connected")
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          setRtStatus("error")
      })

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }

  }, [])

  // 🔥 NOTIF + ALARM
  useEffect(() => {
    if (fire && !alarmPlayed) {

      // 🔊 bunyi
      alarmRef.current?.play().catch(() => {})

      // 🔔 notif
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("🔥 FIRE DETECTED!", {
          body: "Sensor mendeteksi api! Sistem aktif!",
        })
      }

      setAlarmPlayed(true)
    }

    if (!fire) {
      setAlarmPlayed(false)

      // 🔇 stop alarm
      alarmRef.current?.pause()
      if (alarmRef.current) alarmRef.current.currentTime = 0
    }
  }, [fire])

  return (
    <main className="min-h-screen bg-[#eef1f5] p-4 md:p-8 text-gray-700">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-3">
        <h1 className="text-base md:text-lg font-semibold">
          Fire Fighter System Monitor
        </h1>

        <div className="flex flex-wrap items-center gap-2 justify-end w-full md:w-auto">
          <div
            className={`px-3 py-1 rounded-full text-xs md:text-sm shadow-inner ${
              rtStatus === "connected"
                ? "bg-green-100 text-green-700"
                : rtStatus === "error"
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-800"
            }`}
          >
            {rtStatus === "connected" && "Realtime terhubung"}
            {rtStatus === "connecting" && "Menghubungkan…"}
            {rtStatus === "error" && "Koneksi bermasalah"}
          </div>

          <div
            className={`px-3 py-1 rounded-full text-xs md:text-sm shadow-inner ${
              deviceWifiStatus === "online"
                ? "bg-sky-100 text-sky-800"
                : deviceWifiStatus === "offline"
                  ? "bg-orange-100 text-orange-800"
                  : "bg-gray-100 text-gray-600"
            }`}
            title="Berdasarkan waktu terakhir data masuk ke fire_logs dari ESP (~1 detik)."
          >
            {deviceWifiStatus === "online" && "📶 Perangkat online"}
            {deviceWifiStatus === "offline" && "📶 Perangkat offline"}
            {deviceWifiStatus === "unknown" && "📶 Belum ada data ESP"}
          </div>

          <button
            type="button"
            disabled={wifiResetBusy}
            onClick={async () => {
              if (
                !window.confirm(
                  "Reset WiFi di ESP? Board akan hapus simpanan WiFi dan buka portal FIRE_SYSTEM (perlu firmware yang membaca kolom control.wifi_reset)."
                )
              )
                return
              setWifiResetBusy(true)
              setWifiResetMsg(null)
              const ok = await updateControl({ wifi_reset: true })
              setWifiResetBusy(false)
              setWifiResetMsg(
                ok
                  ? "Permintaan reset dikirim. ESP akan portal config jika firmware mendukung."
                  : "Gagal kirim (cek kolom wifi_reset di tabel control + RLS)."
              )
              window.setTimeout(() => setWifiResetMsg(null), 8000)
            }}
            className="px-3 py-1 rounded-full text-xs md:text-sm bg-white border border-gray-300 text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {wifiResetBusy ? "Mengirim…" : "Reset WiFi ESP"}
          </button>
        </div>
      </div>

      {wifiResetMsg && (
        <p className="text-xs text-gray-600 mb-4 -mt-2 md:text-right">{wifiResetMsg}</p>
      )}

      {/* GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">

        {/* SERVO */}
        <div className="md:col-span-2 bg-[#eef1f5] rounded-2xl p-4 md:p-6 shadow-[8px_8px_16px_#d1d5db,-8px_-8px_16px_#ffffff]">

          <p className="text-xs md:text-sm mb-4 text-gray-500">Servo position</p>

          <div className="flex flex-col items-center justify-center">

            <div className="relative w-full max-w-[260px] h-40">

              <div className="absolute w-full h-full border-[12px] border-gray-300 rounded-full border-b-transparent border-l-transparent border-r-transparent"></div>

              <div
                className="absolute bottom-0 left-1/2 w-[3px] h-24 bg-blue-500 origin-bottom rounded-full transition-all duration-300"
                style={{
                  transform: `rotate(${angle - 90}deg)`
                }}
              />

              <div className="absolute bottom-0 left-1/2 w-4 h-4 bg-blue-500 rounded-full -translate-x-1/2"></div>
            </div>

            <p className="text-2xl md:text-3xl font-semibold mt-4">{angle}°</p>
          </div>
        </div>

        {/* RIGHT SIDE */}
        <div className="space-y-5">

          {/* FIRE ALERT */}
          <div
            className={`relative rounded-2xl p-4 md:p-5 shadow-lg overflow-hidden text-white ${
              fire ? "bg-red-500" : "bg-emerald-600"
            }`}
          >

            {fire && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute bottom-0 left-1/2 w-20 h-20 bg-orange-400 blur-2xl opacity-60 animate-pulse -translate-x-1/2"></div>
                <div className="absolute bottom-0 left-1/2 w-14 h-14 bg-yellow-300 blur-xl opacity-80 animate-ping -translate-x-1/2"></div>
              </div>
            )}

            <p className="text-xs md:text-sm opacity-80 mb-2">
              Fire Alert Panel
            </p>

            <p className="font-semibold relative z-10 text-sm md:text-base">
              {fire
                ? "Api terdeteksi · sensor pin 34 (aktif saat LOW)"
                : "Kondisi aman · tidak ada deteksi api"}
            </p>
          </div>

          {/* CONTROL */}
          <div className="bg-[#eef1f5] rounded-2xl p-4 md:p-5 shadow-[inset_6px_6px_10px_#d1d5db,inset_-6px_-6px_#ffffff]">

            <p className="text-xs md:text-sm text-gray-500 mb-4">
              Manual Override
            </p>

            <div className="flex justify-between items-center mb-4">
              <span className="text-sm">Water Pump</span>

              <button
                onClick={() => {
                  const val = !relay
                  setRelay(val)
                  updateControl({ relay: val, mode: "manual" })
                }}
                className={`w-12 h-6 rounded-full flex items-center px-1 transition ${
                  relay ? "bg-green-400" : "bg-gray-300"
                }`}
              >
                <div className={`w-4 h-4 bg-white rounded-full shadow transform transition ${
                  relay ? "translate-x-6" : ""
                }`} />
              </button>
            </div>

            <input
              type="range"
              min="0"
              max="180"
              value={angle}
              onChange={(e) => {
                const val = Number(e.target.value)
                setAngle(val)
                updateControl({ target_angle: val, mode: "manual" })
              }}
              className="w-full"
            />
          </div>

          {/* LED — ikuti data (api: seperti board kedip; pompa ON tanpa api: kuning) */}
          <div className="bg-[#eef1f5] rounded-2xl p-4 md:p-5 shadow-[8px_8px_16px_#d1d5db,-8px_-8px_16px_#ffffff] flex justify-between items-center">

            <span className="text-sm">LED Status</span>

            <div className="flex flex-col items-end gap-1">
              <div
                className={`w-10 h-10 rounded-full shadow-[inset_0_0_10px_rgba(0,0,0,0.25)] ${
                  fire
                    ? "bg-red-500 shadow-[0_0_18px_rgba(239,68,68,0.85)] animate-pulse"
                    : relay
                      ? "bg-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.7)]"
                      : "bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.45)]"
                }`}
              />
              <span className="text-[10px] text-gray-500 max-w-[140px] text-right leading-tight">
                {fire ? "Indikasi alarm (data)" : relay ? "Pompa ON" : "Siaga"}
              </span>
            </div>
          </div>

        </div>

      </div>

      {/* LOG */}
      <div className="mt-6 bg-[#eef1f5] rounded-2xl p-4 md:p-5 shadow-[inset_6px_6px_10px_#d1d5db,inset_-6px_-6px_#ffffff]">

        <p className="text-xs md:text-sm text-gray-500 mb-2">Live Logs</p>

        <div className="text-xs md:text-sm space-y-1 max-h-48 overflow-y-auto pr-1">
          {logs.length === 0 ? (
            <p className="text-gray-400">Belum ada data fire_logs.</p>
          ) : (
            logs.map((row) => (
              <p key={row.id} className="tabular-nums">
                <span className="text-gray-400">{formatLogTime(row.created_at)}</span>
                {" — "}
                {buildLogLine(row)}
              </p>
            ))
          )}
        </div>

      </div>

    </main>
  )
}