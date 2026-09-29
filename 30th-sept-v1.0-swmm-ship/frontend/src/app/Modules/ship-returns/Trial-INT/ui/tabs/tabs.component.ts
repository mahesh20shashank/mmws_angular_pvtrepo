import { CommonModule } from '@angular/common';
import {
  Component,
  ContentChildren,
  Input,
  QueryList,
  TemplateRef,
} from '@angular/core';

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tabs.component.html',
})
export class TabsComponent {

  @Input() labels: string[] = [];

  activeTab = 0;

  @ContentChildren(TemplateRef)
  templates!: QueryList<TemplateRef<any>>;

  setActive(index: number) {
    this.activeTab = index;
  }

  get templatesArray(): TemplateRef<any>[] {
    return this.templates?.toArray() || [];
  }
}
