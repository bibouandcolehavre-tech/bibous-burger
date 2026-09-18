import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { customerAlert } from "./customer-alert";

const icons = require("./social-icons");
const { SOCIAL_PROFILES, isSocialProfileUrl, openSocialProfile } = require("./social-links");

export default function SocialLinks() {
  return <View style={styles.section}>
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
    <Text style={styles.hint}>Un clic pour nous retrouver sur nos réseaux.</Text>
  </View>;
}

const styles = StyleSheet.create({
  section: { marginTop: 20, marginBottom: 24, padding: 18, borderRadius: 22, backgroundColor: "#FFF5E9" },
  title: { color: "#241C18", fontSize: 22, fontWeight: "800" },
  description: { color: "#58463D", fontSize: 14, lineHeight: 21, marginTop: 4 },
  links: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 8, marginTop: 14 },
  link: { flexGrow: 1, flexBasis: 80, maxWidth: 150, alignItems: "center", paddingVertical: 8, paddingHorizontal: 4, borderRadius: 14, borderWidth: 2, borderColor: "transparent", minHeight: 82 },
  focused: { borderColor: "#241C18", backgroundColor: "#FFE8C6" },
  pressed: { opacity: 0.75 },
  icon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  label: { color: "#241C18", fontSize: 13, lineHeight: 18, fontWeight: "700", marginTop: 7 },
  hint: { color: "#58463D", fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 10 },
});
