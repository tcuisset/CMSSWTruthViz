/**
 * control-groups.js - Responsive disclosure groups and inline help.
 */

const ControlGroups = {
    init() {
        const groups = Array.from(document.querySelectorAll('#main-controls details.control-group'));
        if (groups.length === 0) return;

        // On a small viewport the graph should remain the primary view. Search is
        // the one group that remains immediately available; every other group has
        // a compact, clearly labelled summary that can be opened on demand.
        if (window.matchMedia('(max-width: 900px)').matches) {
            groups.forEach(group => { group.open = group.id === 'search-controls'; });
        } else {
            groups.forEach(group => { group.open = true; });
        }

        const helpButtons = groups.flatMap(group =>
            Array.from(group.querySelectorAll('.control-help'))
        );

        const closeHelp = (except = null) => {
            helpButtons.forEach(button => {
                const help = document.getElementById(button.getAttribute('aria-controls'));
                if (!help || button === except) return;
                help.classList.add('hidden');
                button.setAttribute('aria-expanded', 'false');
            });
        };

        helpButtons.forEach(button => {
            const help = document.getElementById(button.getAttribute('aria-controls'));
            if (!help) return;

            button.addEventListener('click', (event) => {
                // The help control lives inside <summary>; keep it from toggling
                // the disclosure when the user only wants the explanation.
                event.preventDefault();
                event.stopPropagation();

                const willOpen = help.classList.contains('hidden');
                closeHelp();
                if (willOpen) {
                    const group = button.closest('details');
                    if (group) group.open = true;
                    help.classList.remove('hidden');
                    button.setAttribute('aria-expanded', 'true');
                }
            });
        });

        groups.forEach(group => {
            group.addEventListener('toggle', () => {
                if (!group.open) closeHelp();
                if (typeof GraphManager !== 'undefined' && GraphManager.cy) {
                    GraphManager.cy.resize();
                }
            });
        });

        document.addEventListener('click', (event) => {
            if (event.target.closest('.control-help, .control-help-popover')) return;
            closeHelp();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeHelp();
        });
    }
};

document.addEventListener('DOMContentLoaded', () => ControlGroups.init());
