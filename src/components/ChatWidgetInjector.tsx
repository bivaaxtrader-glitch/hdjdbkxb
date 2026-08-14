import { useEffect, useState } from 'react';
import { db, doc, onSnapshot } from '../firebase';

export const ChatWidgetInjector = () => {
    const [scriptHtml, setScriptHtml] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'app_config', 'settings'), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                if (data.liveChatScript && data.liveChatScript.trim() !== "") {
                    setScriptHtml(data.liveChatScript);
                } else {
                    setScriptHtml(null);
                }
            }
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!scriptHtml) return;

        // Create a temporary div to parse the script HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = scriptHtml;
        
        const scripts = tempDiv.getElementsByTagName('script');
        const scriptElements: HTMLScriptElement[] = [];

        // Append each script to the document head
        for (let i = 0; i < scripts.length; i++) {
            const sourceScript = scripts[i];
            const newScript = document.createElement('script');
            
            if (sourceScript.src) {
                newScript.src = sourceScript.src;
            }
            if (sourceScript.innerHTML) {
                newScript.innerHTML = sourceScript.innerHTML;
            }
            if (sourceScript.async) newScript.async = true;
            if (sourceScript.defer) newScript.defer = true;
            
            document.head.appendChild(newScript);
            scriptElements.push(newScript);
        }

        // Cleanup function to remove scripts if the config changes
        return () => {
            scriptElements.forEach(script => {
                if (document.head.contains(script)) {
                    document.head.removeChild(script);
                }
            });
            // Some providers like Tawk add a global window object. 
            // We can't perfectly clean up all side effects, but removing the script tag helps.
        };
    }, [scriptHtml]);

    return null; // This component does not render anything visible
};
