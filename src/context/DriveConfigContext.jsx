import { createContext, useContext, useState } from 'react';

const STORAGE_KEY = 'amidaments_drive_config';

const DriveConfigContext = createContext(null);

export const DriveConfigProvider = ({ children }) => {
    const [config, setConfig] = useState(() => {
        // 1. Intentem agafar de les variables d'entorn (Vite)
        const envConfig = {
            clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
            apiKey: import.meta.env.VITE_GOOGLE_API_KEY || '',
            appId: import.meta.env.VITE_GOOGLE_APP_ID || ''
        };

        // Si totes les variables d'entorn obligatòries hi són, les usem
        if (envConfig.clientId && envConfig.apiKey) {
            return envConfig;
        }

        // 2. Si no, intentem agafar de localStorage
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : { clientId: '', apiKey: '', appId: '' };
        } catch {
            return { clientId: '', apiKey: '', appId: '' };
        }
    });

    const setCredentials = (newConfig) => {
        setConfig(newConfig);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    };

    const hasCredentials = !!(config.clientId && config.apiKey && config.appId);

    return (
        <DriveConfigContext.Provider value={{ config, setCredentials, hasCredentials }}>
            {children}
        </DriveConfigContext.Provider>
    );
};

export const useDriveConfig = () => useContext(DriveConfigContext);
