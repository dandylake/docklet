export interface PortBinding {
  containerPort: number;
  hostPort?: number;
  protocol: "tcp" | "udp";
  hostIp?: string;
}

export interface VolumeMount {
  source: string;
  destination: string;
  mode: string;
  rw: boolean;
}

export interface ContainerSummary {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: PortBinding[];
  created: number;
}

export interface ContainerDetail extends ContainerSummary {
  env: string[];
  mounts: VolumeMount[];
  restartPolicy: { name: string; maximumRetryCount: number };
  networkMode: string;
  hostname: string;
  cmd: string[];
  entrypoint: string[];
  labels: Record<string, string>;
  resources: { cpuLimit?: number; memoryLimit?: number };
  tty: boolean;
  stdin: boolean;
}

export interface CreateContainerInput {
  name: string;
  image: string;
  ports?: PortBinding[];
  env?: string[];
  /** Only the container-side path is specified. The host path is auto-managed under
   *  $DOCKLET_DATA_DIR/volumes/<name>/<path>. */
  volumes?: { containerPath: string; mode?: string }[];
  restartPolicy?: { name: string; maximumRetryCount?: number };
  networkMode?: string;
  hostname?: string;
  cmd?: string[];
  labels?: Record<string, string>;
  resources?: { cpuLimit?: number; memoryLimit?: number };
  tty?: boolean;
  stdin?: boolean;
}

export interface ImageSummary {
  id: string;
  repoTags: string[];
  size: number;
  created: number;
}

export interface DockerEvent {
  action: string;
  id: string;
  name: string;
  time: number;
}

export interface PullProgress {
  status: string;
  id?: string;
  progress?: string;
  progressDetail?: { current?: number; total?: number };
}
