import { ButtonComponent } from '../../../shared/components/button/button.component';
import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { IconComponent } from '../../../shared/components/icon/icon.component';


@Component({
    selector: 'app-sidebar',
    standalone: true,
    imports: [IconComponent, ButtonComponent],
    templateUrl: './sidebar.component.html',
    styleUrl: './sidebar.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
    @Input()
    activeSection!: string;

    @Output()
    sectionClicked =
        new EventEmitter<string>();

    /** `icon` is a Lucide icon name (see shared/components/icon). */
    navItems = [
        { id: 'hero', label: 'Home', icon: 'house' },
        { id: 'gallery', label: 'Gallery', icon: 'image' },
        { id: 'info', label: 'Ship Information', icon: 'zap' },
        { id: 'usefulness', label: 'Quick Info', icon: 'lightbulb' },
        { id: 'integration', label: 'Organization', icon: 'network' },
    ];

    changeSection(id: string) {

        this.sectionClicked.emit(id);

    }
}
