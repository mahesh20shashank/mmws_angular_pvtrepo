import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { IconComponent } from "../icon/icon.component";

/** Reusable "grid toolbar" search box — a labelled magnifying-glass icon + text input, used by
 * every OBS list page's search/export toolbar row (`.grid-toolbar`, see styles.css). Two-way
 * bindable via `[value]`/`(valueChange)` to match this codebase's signal-based state pattern
 * (`[value]="searchText()" (valueChange)="searchText.set($event)"`). */
@Component({
  selector: "app-toolbar-search",
  standalone: true,
  imports: [IconComponent],
  templateUrl: "./toolbar-search.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolbarSearch {
  @Input() value = "";
  @Input() placeholder = "Search…";
  @Output() readonly valueChange = new EventEmitter<string>();

  onInput(event: Event): void {
    this.valueChange.emit((event.target as HTMLInputElement).value);
  }
}
