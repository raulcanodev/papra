import type { ThemeColors } from '@/modules/ui/theme.constants';
import { useForm } from '@tanstack/react-form';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as v from 'valibot';
import { useAuthClient } from '@/modules/api/providers/api.provider';
import { useAlert } from '@/modules/ui/providers/alert-provider';
import { useThemeColor } from '@/modules/ui/providers/use-theme-color';
import { useServerConfig } from '../../config/hooks/use-server-config';
import { getEnabledOAuthProviders } from '../auth.models';
import { BackToServerSelectionButton } from '../components/back-to-server-selection';

const loginSchema = v.object({
  email: v.pipe(v.string(), v.email('Please enter a valid email')),
  password: v.pipe(v.string(), v.minLength(8, 'Password must be at least 8 characters')),
});

function isTwoFactorRedirect(data: unknown): boolean {
  return typeof data === 'object'
    && data !== null
    && 'twoFactorRedirect' in data
    && data.twoFactorRedirect === true;
}

export function LoginScreen() {
  const router = useRouter();
  const themeColors = useThemeColor();
  const authClient = useAuthClient();
  const { showAlert } = useAlert();
  const insets = useSafeAreaInsets();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTwoFactorRequired, setIsTwoFactorRequired] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const { serverConfig, isLoading: isConfigLoading } = useServerConfig();

  const form = useForm({
    defaultValues: {
      email: '',
      password: '',
    },
    validators: {
      onChange: loginSchema,
    },

    onSubmit: async ({ value }) => {
      setIsSubmitting(true);
      try {
        const response = await authClient.signIn.email({ email: value.email, password: value.password, rememberMe: true });

        if (response.error) {
          throw new Error(response.error.message);
        }

        if (isTwoFactorRedirect(response.data)) {
          setIsTwoFactorRequired(true);
          return;
        }

        router.replace('/(app)/(with-organizations)/(tabs)/list');
      } catch (error) {
        showAlert({
          title: 'Login Failed',
          message: error instanceof Error ? error.message : 'An error occurred',
        });
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  const handleSocialSignIn = async (provider: string) => {
    try {
      const response = await authClient.signIn.social({ provider, callbackURL: '/' });
      if (response.error) {
        throw Object.assign(new Error(response.error.message), response.error);
      }

      if (authClient.getCookie().includes('two_factor=')) {
        setIsTwoFactorRequired(true);
      }
    } catch (error) {
      showAlert({
        title: 'Sign In Failed',
        message: error instanceof Error ? error.message : 'An error occurred',
      });
    }
  };

  const authConfig = serverConfig?.auth;
  const isEmailEnabled = authConfig?.providers?.email?.isEnabled ?? false;

  const oauthProviders = getEnabledOAuthProviders({ serverConfig });

  const styles = createStyles({ themeColors });

  const handleTwoFactorVerification = async () => {
    setIsSubmitting(true);
    try {
      const response = useBackupCode
        ? await authClient.twoFactor.verifyBackupCode({ code: twoFactorCode.trim(), trustDevice })
        : await authClient.twoFactor.verifyTotp({ code: twoFactorCode.trim(), trustDevice });

      if (response.error) {
        throw new Error(response.error.message);
      }

      router.replace('/(app)/(with-organizations)/(tabs)/list');
    } catch (error) {
      showAlert({
        title: 'Verification Failed',
        message: error instanceof Error ? error.message : 'The code could not be verified',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isConfigLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={themeColors.primary} />
      </View>
    );
  }

  if (isTwoFactorRequired) {
    return (
      <KeyboardAvoidingView
        style={{ ...styles.container, paddingTop: insets.top }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>Two-factor authentication</Text>
            <Text style={styles.subtitle}>
              {useBackupCode
                ? 'Enter one of your recovery codes.'
                : 'Enter the 6-digit code from your authenticator app.'}
            </Text>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>{useBackupCode ? 'Recovery code' : 'Authentication code'}</Text>
              <TextInput
                style={styles.input}
                placeholder={useBackupCode ? 'XXXXX-XXXXX' : '123456'}
                placeholderTextColor={themeColors.mutedForeground}
                value={twoFactorCode}
                onChangeText={setTwoFactorCode}
                autoCapitalize="characters"
                autoCorrect={false}
                keyboardType={useBackupCode ? 'default' : 'number-pad'}
                maxLength={useBackupCode ? undefined : 6}
                editable={!isSubmitting}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.label}>Trust this device</Text>
              <Switch value={trustDevice} onValueChange={setTrustDevice} disabled={isSubmitting} />
            </View>

            <TouchableOpacity
              style={[styles.button, (isSubmitting || twoFactorCode.trim().length === 0) && styles.buttonDisabled]}
              onPress={handleTwoFactorVerification}
              disabled={isSubmitting || twoFactorCode.trim().length === 0}
            >
              {isSubmitting
                ? <ActivityIndicator color={themeColors.primaryForeground} />
                : <Text style={styles.buttonText}>Verify</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => {
                setUseBackupCode(value => !value);
                setTwoFactorCode('');
              }}
              disabled={isSubmitting}
            >
              <Text style={styles.linkText}>{useBackupCode ? 'Use authenticator app' : 'Use a recovery code'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryLinkButton}
              onPress={() => {
                setIsTwoFactorRequired(false);
                setTwoFactorCode('');
              }}
              disabled={isSubmitting}
            >
              <Text style={styles.mutedLinkText}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ ...styles.container, paddingTop: insets.top }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <BackToServerSelectionButton />

        <View style={styles.header}>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>
        </View>

        {isEmailEnabled && (
          <View style={styles.formContainer}>
            <form.Field name="email">
              {field => (
                <View style={styles.fieldContainer}>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="you@example.com"
                    placeholderTextColor={themeColors.mutedForeground}
                    value={field.state.value}
                    onChangeText={field.handleChange}
                    onBlur={field.handleBlur}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    editable={!isSubmitting}
                  />
                </View>
              )}
            </form.Field>

            <form.Field name="password">
              {field => (
                <View style={styles.fieldContainer}>
                  <Text style={styles.label}>Password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your password"
                    placeholderTextColor={themeColors.mutedForeground}
                    value={field.state.value}
                    onChangeText={field.handleChange}
                    onBlur={field.handleBlur}
                    secureTextEntry
                    editable={!isSubmitting}
                  />
                </View>
              )}
            </form.Field>

            <TouchableOpacity
              style={[styles.button, isSubmitting && styles.buttonDisabled]}
              onPress={async () => form.handleSubmit()}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? (
                    <ActivityIndicator color={themeColors.primaryForeground} />
                  )
                : (
                    <Text style={styles.buttonText}>Sign In</Text>
                  )}
            </TouchableOpacity>
          </View>
        )}

        {(oauthProviders.length > 0) && (
          <>
            {isEmailEnabled && (
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>
            )}

            <View style={styles.socialButtons}>
              {oauthProviders.map(provider => (
                <TouchableOpacity
                  key={provider.providerId}
                  style={styles.socialButton}
                  onPress={async () => handleSocialSignIn(provider.providerId)}
                >
                  <Text style={styles.socialButtonText}>
                    Continue with
                    {' '}
                    {provider.providerName}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {authConfig?.isRegistrationEnabled === true && (
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => router.push('/auth/signup')}
          >
            <Text style={styles.linkText}>
              Don&apos;t have an account? Sign up
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles({ themeColors }: { themeColors: ThemeColors }) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: themeColors.background,
    },
    centerContent: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    scrollContent: {
      flexGrow: 1,
      padding: 24,
    },
    header: {
      marginBottom: 48,
      marginTop: 16,
    },
    title: {
      fontSize: 32,
      fontWeight: 'bold',
      color: themeColors.foreground,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: themeColors.mutedForeground,
    },
    formContainer: {
      gap: 16,
    },
    fieldContainer: {
      gap: 8,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: themeColors.foreground,
    },
    input: {
      height: 50,
      borderWidth: 1,
      borderColor: themeColors.border,
      borderRadius: 8,
      paddingHorizontal: 16,
      fontSize: 16,
      color: themeColors.foreground,
      backgroundColor: themeColors.secondaryBackground,
    },
    button: {
      height: 50,
      backgroundColor: themeColors.primary,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 8,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      color: themeColors.primaryForeground,
      fontSize: 16,
      fontWeight: '600',
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 24,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: themeColors.border,
    },
    dividerText: {
      marginHorizontal: 16,
      color: themeColors.mutedForeground,
      fontSize: 14,
    },
    socialButtons: {
      gap: 12,
    },
    socialButton: {
      height: 50,
      borderWidth: 1,
      borderColor: themeColors.border,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: themeColors.secondaryBackground,
    },
    socialButtonText: {
      color: themeColors.foreground,
      fontSize: 16,
      fontWeight: '500',
    },
    linkButton: {
      marginTop: 24,
      alignItems: 'center',
    },
    secondaryLinkButton: {
      marginTop: 4,
      alignItems: 'center',
    },
    linkText: {
      color: themeColors.primary,
      fontSize: 14,
    },
    mutedLinkText: {
      color: themeColors.mutedForeground,
      fontSize: 14,
    },
    switchRow: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backToServerButton: {
      marginBottom: 16,
      alignSelf: 'flex-start',
    },
    backToServerText: {
      color: themeColors.primary,
      fontSize: 14,
    },
  });
}
