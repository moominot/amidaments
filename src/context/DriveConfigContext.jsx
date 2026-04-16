import React, { createContext, useContext, useState } from 'react';

const STORAGE_KEY = 'amidaments_drive_config';

const DriveConfigContext = createContext(null);

export const DriveConfigProvider = ({ children }) => {
    const [config, setConfig] = useState(() => {
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
