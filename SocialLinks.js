import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { customerAlert } from "./customer-alert";

const icons = require("./social-icons");
const { SOCIAL_PROFILES, isSocialProfileUrl, openSocialProfile } = require("./social-links");

export default function SocialLinks({ style }) {
  return <View style={[styles.section, style]}>
    <Text accessibilityRole="header" style={styles.title}>Suivez-nous</Text>
    <Text style={styles.description}>Les nouveautés et les coulisses de Bibou’s Burgers.</Text>
    <View style={styles.links}>
      {SOCIAL_PROFILES.filter(isSocialProfileUrl).map((profile) => {
        const icon = icons[profile.icon];
        // Real anchors on web: new tab, keyboard support, no interruption to the basket.
        const linkProps = Platform.OS === "web"
          ? { href: profile.url, hrefAttrs: { target: "_blank", rel: "noopener noreferrer" } }
          : { onPress: () => openSocialProfile(profile, Linking.openURL, customerAlert) };
        return <Pressable key={profile.id} {...linkProps}
          accessibilityRole="link"
          accessibilityLabel={`Suivre Bibou’s Burgers sur ${profile.label}`}
          accessibilityHint={Platform.OS === "web" ? "Ouvre un nouvel onglet" : "Ouvre le réseau social ou le navigateur"}
          style={({ pressed, focused, hovered }) => [styles.link, (focused || hovered) && styles.focused, pressed && styles.pressed]}>
          <View style={[styles.icon, { backgroundColor: profile.color }]}>
            <Svg width={26} height={28} viewBox={icon.viewBox} accessible={false} aria-hidden={true} focusable={false}>
              <Path d={icon.path} fill="#FFFFFF" />
            </Svg>
          </View>
          <Text style={styles.label}>{profile.label}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  section: { height: 190, padding: 14, borderRadius: 23, backgroundColor: "#1D1917", justifyContent: "center" },
  title: { color: "#FFFFFF", fontSize: 25, lineHeight: 30, fontWeight: "800" },
  description: { color: "#F5DECA", fontSize: 13, lineHeight: 18, marginTop: 4 },
  links: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 8 },
  link: { flexGrow: 1, flexBasis: 0, maxWidth: 150, alignItems: "center", paddingVertical: 5, paddingHorizontal: 2, borderRadius: 12, borderWidth: 2, borderColor: "transparent", minHeight: 78 },
  focused: { borderColor: "#F1B94F", backgroundColor: "#362B22" },
  pressed: { opacity: 0.75 },
  icon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  label: { color: "#FFFFFF", fontSize: 13, lineHeight: 18, fontWeight: "700", marginTop: 4 },
});
