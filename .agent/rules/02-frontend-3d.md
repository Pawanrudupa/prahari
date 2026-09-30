# Frontend 3D rules
- Follow `docs/04-DESIGN-3D-UX.md` tokens and scene specs exactly.
- InstancedMesh for nodes; pooled particles (max 500); mutate refs in `useFrame`.
- Auto-degrade quality under 40 fps; provide 2D fallback and reduced-motion mode.
- Every 3D selection must have a keyboard-accessible list equivalent.
- Outcomes use color AND icon/shape.
