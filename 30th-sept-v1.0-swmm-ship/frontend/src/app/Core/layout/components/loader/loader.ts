import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { AppService } from '../../../services/app/app.service';

@Component({
  selector: 'app-loader',
  standalone: true,
  templateUrl: 'loader.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['loader.css']
})
export class LoaderComponent {
  appService = inject(AppService);


}
