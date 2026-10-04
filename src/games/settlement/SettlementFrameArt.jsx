import { makeUvNineSlice } from './settlementNineSlice.js';

// This is a runtime view of immutable generated artwork, not a cropped source.
// The parent owns flow, semantics and hit targets; every material piece is inert.
export function SettlementFrameArt({ material }) {
  const pieces = makeUvNineSlice(material);
  return (
    <span className="settlement-frame-art" aria-hidden="true">
      {pieces.map(piece => (
        <span
          key={piece.id}
          className="settlement-frame-art-piece"
          style={{ ...piece.style, backgroundImage: `url(${material.url})` }}
        />
      ))}
    </span>
  );
}

