import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

const dev = process.env.ROLLUP_WATCH;

export default {
  input: 'src/hvac-scheduler-card.ts',
  output: {
    file: 'dist/hvac-scheduler-card.js',
    format: 'es',
    ...(dev ? { sourcemap: true } : {}),
  },
  plugins: [
    resolve(),
    typescript({ tsconfig: './tsconfig.json', sourceMap: !!dev }),
    !dev && terser({ format: { comments: false } }),
  ].filter(Boolean),
};
