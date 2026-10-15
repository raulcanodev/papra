import type { ParentComponent } from 'solid-js';
import { Navigate } from '@solidjs/router';
import { Match, Switch } from 'solid-js';
import { useSession } from '../composables/use-session.composable';
import { readSessionHint } from '../session-hint';

export const PublicOnlyPage: ParentComponent = (props) => {
  const { getIsAuthenticated, sessionQuery } = useSession();
  // Visitors see the sign in pages right away; a known member waits for the session to be sent to the app
  const isKnownVisitor = !readSessionHint();

  return (
    <Switch>
      <Match when={!sessionQuery.isLoading && getIsAuthenticated()}>
        <Navigate href="/" />
      </Match>
      <Match when={(isKnownVisitor || !sessionQuery.isLoading) && !getIsAuthenticated()}>
        {props.children}
      </Match>
    </Switch>
  );
};
