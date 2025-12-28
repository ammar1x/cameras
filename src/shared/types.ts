export interface CameraConfig {
  id: number;
  name: string;
  enabled: boolean;
}

export interface XVRConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  channels: CameraConfig[];
}

export interface AppConfig {
  xvr: XVRConfig;
  server: {
    port: number;
  };
}

export interface StreamInfo {
  channelId: number;
  wsUrl: string;
  name: string;
}
