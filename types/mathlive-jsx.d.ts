// MathLive registers `<math-field>` and `<math-virtual-keyboard>` as
// HTML custom elements at runtime. React 19 sources its JSX
// IntrinsicElements interface from `react/jsx-runtime` rather than
// the legacy global JSX namespace, so we augment that module here.
// The file lives outside global.d.ts on purpose — the `import 'react'`
// would otherwise turn that file into a module and break its
// ambient `*.module.css` declarations.

import 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          ref?: React.Ref<HTMLElement>;
          readonly?: string | boolean;
          'virtual-keyboard-mode'?: string;
          'math-virtual-keyboard-policy'?: string;
        },
        HTMLElement
      >;
      'math-virtual-keyboard': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
    }
  }
}
