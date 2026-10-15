import type { Component } from 'solid-js';
import { Avatar, Style } from '@dicebear/core';
import croodlesNeutralDefinition from '@dicebear/styles/croodles-neutral.json' with { type: 'json' };
import shapeGridDefinition from '@dicebear/styles/shape-grid.json' with { type: 'json' };
import { createMemo } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';

const userAvatarStyle = new Style(croodlesNeutralDefinition);
const organizationAvatarStyle = new Style(shapeGridDefinition);

function createDiceBearAvatar({ seed, type }: { seed: string; type: 'user' | 'organization' }) {
  const style = type === 'user' ? userAvatarStyle : organizationAvatarStyle;

  return new Avatar(style, {
    seed,
  }).toDataUri();
}

type DiceBearAvatarProps = {
  seed: string;
  type: 'user' | 'organization';
  alt?: string;
  class?: string;
};

export const DiceBearAvatar: Component<DiceBearAvatarProps> = (props) => {
  const src = createMemo(() => createDiceBearAvatar({
    seed: props.seed,
    type: props.type,
  }));

  return (
    <img
      src={src()}
      alt={props.alt ?? ''}
      class={cn('shrink-0 object-cover', props.class)}
    />
  );
};
