console.log('[RENDERER] start');

import { registerRoute, go } from './router.js';
import { setCurrentProject } from './state.js';

/* ---------------- Project Selector ---------------- */
registerRoute('project-selector', async (root) => {
    const module = await import(
        './components/project-selector/projectSelector.index.js'
    );

    module.initProjectSelector(root, (projectName) => {
        console.log('[RENDERER] project selected:', projectName);
        setCurrentProject(projectName);
        go('workspace');
    });
});

/* ---------------- Workspace ---------------- */
registerRoute('workspace', async (root) => {
    const module = await import(
        './components/workspace/workspace.index.js'
    );

    module.initWorkspace(root, {
        onImportData: () => go('data-editor'),
        onEditLanding: () => go('landing-editor'),
        onRunLanding: () => go('landing-runtime')
    });
});

/* ---------------- Data Editor ---------------- */
registerRoute('data-editor', async (root) => {
    const module = await import(
        './components/data-editor/dataEditor.index.js'
    );
    module.initDataEditor(root);
});

/* ---------------- Landing Editor ---------------- */
registerRoute('landing-editor', async (root) => {
    const module = await import(
        './components/landing-editor/landingEditor.index.js'
    );
    module.initLandingEditor(root);
});

/* ---------------- Landing Runtime ---------------- */
registerRoute('landing-runtime', async (root) => {
    const module = await import(
        './components/landing-runtime/landingRuntime.index.js'
    );
    module.initLandingRuntime(root);
});

/* ---------------- Start App ---------------- */
go('project-selector');
