/* eslint-disable react-refresh/only-export-components */
import * as React from "react"

export type WifiNetwork = {
  ssid: string
  strength: number // 0..4
  secured: boolean
}

type SystemState = {
  volume: number
  brightness: number
  wifiOn: boolean
  bluetoothOn: boolean
  airplane: boolean
  doNotDisturb: boolean
  battery: number
  charging: boolean
  network: string
  knownNetworks: WifiNetwork[]
  hostname: string
}

type SystemContextValue = SystemState & {
  setVolume: (v: number) => void
  setBrightness: (v: number) => void
  toggleWifi: () => void
  toggleBluetooth: () => void
  toggleAirplane: () => void
  toggleDND: () => void
  selectNetwork: (ssid: string) => void
}

const SystemContext = React.createContext<SystemContextValue | undefined>(
  undefined
)

const NETWORKS: WifiNetwork[] = [
  { ssid: "dockerlab-corp", strength: 4, secured: true },
  { ssid: "guest-wifi", strength: 3, secured: false },
  { ssid: "office-2.4g", strength: 2, secured: true },
  { ssid: "lab-mesh-5g", strength: 4, secured: true },
  { ssid: "starbucks-on-3rd", strength: 1, secured: false },
]

export function SystemProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<SystemState>({
    volume: 60,
    brightness: 80,
    wifiOn: true,
    bluetoothOn: true,
    airplane: false,
    doNotDisturb: false,
    battery: 82,
    charging: false,
    network: "dockerlab-corp",
    knownNetworks: NETWORKS,
    hostname: "dockerlab-01",
  })

  const setVolume = React.useCallback(
    (v: number) => setState((s) => ({ ...s, volume: v })),
    []
  )
  const setBrightness = React.useCallback(
    (v: number) => setState((s) => ({ ...s, brightness: v })),
    []
  )
  const toggleWifi = React.useCallback(
    () => setState((s) => ({ ...s, wifiOn: !s.wifiOn })),
    []
  )
  const toggleBluetooth = React.useCallback(
    () => setState((s) => ({ ...s, bluetoothOn: !s.bluetoothOn })),
    []
  )
  const toggleAirplane = React.useCallback(
    () =>
      setState((s) => ({
        ...s,
        airplane: !s.airplane,
        wifiOn: s.airplane ? s.wifiOn : false,
        bluetoothOn: s.airplane ? s.bluetoothOn : false,
      })),
    []
  )
  const toggleDND = React.useCallback(
    () => setState((s) => ({ ...s, doNotDisturb: !s.doNotDisturb })),
    []
  )
  const selectNetwork = React.useCallback(
    (ssid: string) => setState((s) => ({ ...s, network: ssid })),
    []
  )

  const value = React.useMemo(
    () => ({
      ...state,
      setVolume,
      setBrightness,
      toggleWifi,
      toggleBluetooth,
      toggleAirplane,
      toggleDND,
      selectNetwork,
    }),
    [
      state,
      setVolume,
      setBrightness,
      toggleWifi,
      toggleBluetooth,
      toggleAirplane,
      toggleDND,
      selectNetwork,
    ]
  )

  return (
    <SystemContext.Provider value={value}>{children}</SystemContext.Provider>
  )
}

export function useSystem() {
  const ctx = React.useContext(SystemContext)
  if (!ctx) throw new Error("useSystem must be used within SystemProvider")
  return ctx
}
