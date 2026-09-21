import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface ClientInfo {
  id: string;
  nombre: string;
  activo: boolean;
  kommo: {
    configured: boolean;
    subdomain: string | null;
    hasCfPlantilla: boolean;
  };
}

const KEY = "senderio-client";

type Ctx = {
  clientId: string;
  setClientId: (id: string) => void;
  clients: ClientInfo[];
};

const ClientCtx = createContext<Ctx>({
  clientId: "mooney",
  setClientId: () => {},
  clients: [],
});

export function ClientProvider({ children }: { children: ReactNode }) {
  const [clientId, setClientIdState] = useState(() => {
    try {
      return localStorage.getItem(KEY) || "mooney";
    } catch {
      return "mooney";
    }
  });
  const [clients, setClients] = useState<ClientInfo[]>([]);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((rows: ClientInfo[]) => {
        if (Array.isArray(rows) && rows.length) setClients(rows);
      })
      .catch(() => {
        setClients([
          {
            id: "mooney",
            nombre: "Mooney",
            activo: true,
            kommo: { configured: true, subdomain: null, hasCfPlantilla: false },
          },
          {
            id: "king",
            nombre: "King",
            activo: true,
            kommo: { configured: false, subdomain: null, hasCfPlantilla: false },
          },
        ]);
      });
  }, []);

  function setClientId(id: string) {
    setClientIdState(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* ignore */
    }
  }

  const value = useMemo(
    () => ({ clientId, setClientId, clients }),
    [clientId, clients]
  );

  return <ClientCtx.Provider value={value}>{children}</ClientCtx.Provider>;
}

export function useClient() {
  return useContext(ClientCtx);
}
