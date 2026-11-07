import { api } from "@/services/api";
import { isTauri } from "@/utils/platform";
import type { StateCreator } from "zustand";
import type { FullAppStore } from "./types";

interface ServerConfig {
  readOnly?: boolean;
  openaiResponsesAvailable?: boolean;
}

export interface ServerSliceState {
  isServerReadOnly: boolean;
  isServerConfigLoaded: boolean;
  isOpenAIResponsesAvailable: boolean;
}

export interface ServerSliceActions {
  loadServerConfig: () => Promise<void>;
}

export type ServerSlice = ServerSliceState & ServerSliceActions;

const initialServerState: ServerSliceState = {
  isServerReadOnly: false,
  isServerConfigLoaded: false,
  isOpenAIResponsesAvailable: false,
};

export const createServerSlice: StateCreator<
  FullAppStore,
  [],
  [],
  ServerSlice
> = (set) => ({
  ...initialServerState,

  loadServerConfig: async () => {
    if (isTauri()) {
      set({
        isServerReadOnly: false,
        isServerConfigLoaded: true,
        isOpenAIResponsesAvailable: true,
      });
      return;
    }

    try {
      const config = await api<ServerConfig>("get_server_config");
      set({
        isServerReadOnly: config.readOnly === true,
        isServerConfigLoaded: true,
        isOpenAIResponsesAvailable: config.openaiResponsesAvailable === true,
      });
    } catch (error) {
      console.warn("Failed to load server config:", error);
      set({
        isServerReadOnly: false,
        isServerConfigLoaded: true,
        isOpenAIResponsesAvailable: false,
      });
    }
  },
});
