import { ButtonComponent } from '../button/button.component';
import { Component, computed, input, output } from '@angular/core';
import { SidebarItem } from './collapsible-sidebar.models';
import { IconComponent } from '../icon/icon.component';
@Component({
  selector: 'app-collapsible-sidebar',
  standalone: true,
  imports: [IconComponent, ButtonComponent],
  templateUrl: './collapsible-sidebar.html',
  styleUrl: './collapsible-sidebar.css',
})
export class CollapsibleSidebar {

  readonly title = input('Menu');
  readonly items = input.required<SidebarItem[]>();
  readonly selectedId = input<string>();
  readonly collapsed = input(false);
  readonly collapseOnSelect = input(true);
  readonly itemSelected = output<string>();
  readonly collapsedChange = output<boolean>();
  protected readonly isCollapsed = computed(() => this.collapsed());
  protected toggle(): void {
    this.collapsedChange.emit(!this.collapsed());
  }
  protected select(id: string): void {
    this.itemSelected.emit(id);
    if (this.collapseOnSelect()) {
      this.collapsedChange.emit(true);
    }
  }

}
