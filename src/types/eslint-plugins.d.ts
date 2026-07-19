declare module 'eslint-plugin-security' {
  import type { Rule } from 'eslint';

  interface SecurityPlugin {
    readonly rules: Record<string, Rule.RuleModule>;
  }

  const plugin: SecurityPlugin;
  export default plugin;
}

declare module 'eslint-plugin-react-native' {
  import type { Rule } from 'eslint';

  interface ReactNativePlugin {
    readonly rules: Record<string, Rule.RuleModule>;
  }

  const plugin: ReactNativePlugin;
  export default plugin;
}
