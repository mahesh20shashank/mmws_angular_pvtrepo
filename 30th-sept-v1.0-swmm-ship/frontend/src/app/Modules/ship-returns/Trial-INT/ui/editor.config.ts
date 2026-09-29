

import 'tinymce/tinymce';
import 'tinymce/icons/default';
import 'tinymce/themes/silver';
import 'tinymce/plugins/advlist';
import 'tinymce/plugins/anchor';
import 'tinymce/plugins/autolink';
import 'tinymce/plugins/autosave';
import 'tinymce/plugins/charmap';
import 'tinymce/plugins/code';
import 'tinymce/plugins/directionality';
import 'tinymce/plugins/emoticons';
import 'tinymce/plugins/fullscreen';
import 'tinymce/plugins/help';
import 'tinymce/plugins/image';
import 'tinymce/plugins/importcss';
import 'tinymce/plugins/insertdatetime';
import 'tinymce/plugins/link';
import 'tinymce/plugins/lists';
import 'tinymce/plugins/media';
import 'tinymce/plugins/nonbreaking';
import 'tinymce/plugins/pagebreak';
import 'tinymce/plugins/preview';
import 'tinymce/plugins/searchreplace';
import 'tinymce/plugins/table';
import 'tinymce/plugins/visualblocks';
import 'tinymce/plugins/visualchars';
import 'tinymce/plugins/wordcount';

const content_style = `

// In a more typical environment this constant would be a file, style.css,
// referenced in the tinymce.init configuration with the content_css option.

body {
  background-color: #f0eeee;
  padding: 1rem;
}

section {
  padding: 4rem 4rem 1rem;
  box-sizing: border-box;
  max-width: 1050px;
  min-width: 820px;

  margin: 2rem auto;
  background-color: #fff;
  box-shadow: rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.05) 0px 4px 6px -2px;
  background-image: url("images/template-document-body-landscape_2x.png");
  background-size: 100%;
  background-position: right bottom;
  background-repeat: no-repeat;
  display: grid;
  grid-template-columns: auto 220px;
  grid-template-rows: auto 60px;
  column-gap: 2rem;
  row-gap: 1rem;
}

section header,
section aside {
  grid-column: 2 / 3;
  grid-row: 1 / 2;
}

section main {
  position: relative;
  grid-column: 1 / 2;
  grid-row: 1 / 2;
}

section footer {
  grid-column: 1 / 3;
  grid-row: 2 / 3;
}

section main:empty::before,
section main:has(> br[data-mce-bogus]:first-child)::before {
  content: "Write something...";
  position: absolute;
  top: 0;
  left: 0;
  color: #999;
}

section main > * {
  margin: 0;
}

section main > * + * {
  margin-top: .5rem;
}

section.cover {
  background-color: #fed330;
  background-image: url("images/template-document-cover-landscape_2x.png");
  background-size: cover;
  background-position: right bottom;
  background-repeat: no-repeat;
}

section.cover main {
  align-self: center;
}

section.cover h1 {
  font-weight: 900;
  font-size: 5rem;
  letter-spacing: -1px;
  line-height: 1em;
  margin-bottom: 2.5rem;
}

section.end {
  background-color: #2C3A47;
  background-image: url("images/template-document-end-landscape_2x.png");
  background-size: 100%;
  background-position: right bottom;
  background-repeat: no-repeat;
  color: #C0C4C8;
}

section.end  a {
  color: #fff;
}

.editable:hover:not(:focus) {
  outline: 3px solid #b4d7ff;
  outline-offset: 8px;
}

.editable:focus {
  outline: none;
}
  :root {
    --bs-primary-rgb: 62, 92, 210;
    --bs-border-radius: 0;
    --bs-border-radius-lg: 0;
  }

  html {
    font-size: 16px;
  }

  .tiny-logo {
    position: absolute;
    top: 2rem;
    left: 2rem;
  }

  h1 {
    font-size: 2.75rem;
  }

  h1,
  h2,
  h3 {
    margin-bottom: .5em;
  }

  ul.fancy li {
    margin-bottom: .5em;
  }

  ul.fancy li::marker {
    content: '✅  ';
  }

  .tiny-hero {
    background-image: url(images/sbc-cms-template-cover.png);
    background-size: cover;
    background-position: center center;
  }

  @media screen and (min-width: 768px) {
    .register-form {
      margin-bottom: -200px;
    }
  }

  form {
    pointer-events: none;
  }

  .tiny-editable {
    position: relative;
  }
  .tiny-editable:hover:not(:focus),
  .tiny-editable:focus {
    outline: 3px solid #b4d7ff;
    outline-offset: 4px;
  }

  .tiny-editable:empty::before,
  .tiny-editable:has(> br[data-mce-bogus]:first-child)::before {
    content: "Write here...";
    position: absolute;
    top: 0;
    left: 0;
    color: #999;
  }
`;

export const init = {
  menubar: 'file edit view insert format tools table help',
  // List of all stable free-tier plugins
  plugins: [
    'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview','code',
    'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
    'insertdatetime', 'media', 'table', 'help', 'wordcount', 'directionality',
    'emoticons', 'importcss', 'autosave', 'pagebreak', 'nonbreaking', 'visualchars'
  ],
  // Modern, organized toolbar
  toolbar: 'undo redo fullscreen | blocks fontfamily fontsize |' +
           'bold italic underline strikethrough | align numlist bullist | ' +
           'link image media table | lineheight outdent indent | ' +
           'forecolor backcolor emoticons | charmap removeformat |  preview dump | code ',

  // High-end UI tweaks
  skin: 'oxide',
  branding: false, // Removes "Powered by Tiny"
  promotion: false, // Removes the "Upgrade" button in the top right

  // Customizing the font options
  font_size_formats: '8pt 10pt 12pt 14pt 16pt 18pt 24pt 36pt 48pt',

  // Allow local image upload (free feature)
  image_title: true,
  automatic_uploads: true,
  file_picker_types: 'image',  fullpagehtml_default_doctype: '<!DOCTYPE html>',
  fullpagehtml_default_title: 'Full Page HTML Plugin Demo Document',
  fullpagehtml_default_encoding: 'UTF-8',
  fullpagehtml_default_body_style: 'margin: 20px; padding: 15px; font-family: Georgia, Times, serif; font-size: 16px; color: #2c3e50;',
  fullpagehtml_hide_in_source_view: false,
  // Editor Configuration Options
  ruler_unit: 'in',
  editor_deselector: '.tiny-editable',
  editable_class: 'editable',
  readonly: false,
  // min_height: 150,
  max_height: 800,
  min_width: 600,
  max_width: 1200,
    browser_spellcheck: true,
    content_style: content_style,
    placeholder: 'Enter text here...',
    pagebreak_separator: '<!-- Page Break -->',
    elementpath: false,
    mergetags_prefix: '*{',
    mergetags_suffix: '}*',
    mergetags_list: [
        {
            title: 'Client',
            menu: [
                {
                    value: 'client.givenname',
                    title: 'Given name'
                },
                {
                    value: 'client.familyname',
                    title: 'Family name'
                },
                {
                    value: 'client.company',
                    title: 'Company'
                }
            ]
        },
        {
            title: 'Schedule',
            menu: [
                {
                    value: 'submission.date',
                    title: 'Submission date'
                },
                {
                    value: 'completion.date',
                    title: 'Completion date'
                }
            ],
        },
    ],

    base_url: '/tinymce', // Root for resources
    suffix: '.min'   ,     // Suffix to use when loading resources
  setup: function (editor: any) {
    editor.ui.registry.addButton('custompaste', {
      icon: 'paste',
      tooltip: 'Paste from Clipboard',
      onAction: async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            editor.insertContent(text);
          } else {
            editor.notificationManager.open({
              text: 'Clipboard is empty or inaccessible.',
              type: 'warning',
              timeout: 3000
            });
          }
        } catch (err) {
          editor.notificationManager.open({
            text: 'Clipboard access denied. Use Ctrl+V instead.',
            type: 'error',
            timeout: 3000
          });
        }
      }
    });
  },
};
