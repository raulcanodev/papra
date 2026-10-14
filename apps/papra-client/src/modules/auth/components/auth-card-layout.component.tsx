import type { ParentComponent } from 'solid-js';
import { ShaderGradient } from '@/modules/ui/components/shader-gradient';
import { AuthLayout } from '../../ui/layouts/auth-layout.component';

export const AuthBackgroundLayout: ParentComponent = (props) => {
  return (
    <AuthLayout
      background={(
        <>
          <ShaderGradient />
          <div class="absolute inset-0 bg-background/0 dark:bg-background/55" />
        </>
      )}
    >
      {props.children}
    </AuthLayout>
  );
};

export const AuthCard: ParentComponent = (props) => {
  return (
    <div class="flex items-center justify-center min-h-[calc(100vh-84px)] px-4 py-8 sm:px-8 sm:py-12">
      <div class="w-full max-w-lg overflow-hidden rounded-2xl bg-background shadow-xl shadow-foreground/5">
        <div class="px-6 py-9 sm:px-12 sm:py-12">
          {props.children}
        </div>
      </div>
    </div>
  );
};
