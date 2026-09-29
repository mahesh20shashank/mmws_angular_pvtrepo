import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-parameter-card',
  templateUrl: './parameter-card.component.html',
  styleUrls: ['./parameter-card.component.css']
})
export class ParameterCardComponent {
  @Input() serial!: string;
  @Input() title!: string;
}
