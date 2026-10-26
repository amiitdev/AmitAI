# Releases

The APKs are attached to GitHub Releases, not committed to git (they are 65–101 MB
each). Download from the [Releases page](https://github.com/amiitdev/AmitAI/releases).

| File | Version name | versionCode | Size | MD5 |
|---|---|---|---|---|
| `AmitAI-3.1.apk` | 3.1 | 4 | 65 MB | `3e4e55094a4c404e447f292f2374719d` |
| `AmitAI-3.2.apk` | 3.3 (see note) | 6 | 66 MB | `e387d5c7b934bebbdf54bb0cd0d52089` |
| `AmitAI-3.3-wakeword.apk` | 3.3 | 6 | 101 MB | `e3ed0901bd0b3d386369d52e7bfb9103` |
| `AmitAI-3.4.apk` | 3.4 | 7 | 101 MB | `f65d816d292d19e406f0664d017826c7` |
| `AmitAI-3.5.apk` | 3.5 | 8 | 101 MB | `cb2c379838d5e4c4f8c4fe27b8807954` |
| `AmitAI-3.6.apk` | 3.6 | 9 | 101 MB | `ca0beb275f4d71c09603251d33271046` |
| `AmitAI-3.7.apk` | 3.7 | 10 | 101 MB | `e8e5916b22f06fae718829716fef3ef9` |
| `AmitAI-3.8.apk` | 3.8 | 11 | 101 MB | `e7215eafd5bd7a2531d4fef3a5717f26` |

All builds: `com.amit.ai`, min SDK 24, target SDK 36, ABIs `arm64-v8a`,
`armeabi-v7a`, `x86`, `x86_64`.

## Note on 3.2

`AmitAI-3.2.apk` reports `versionName 3.3` in its manifest — the version bump
landed before that build was produced. It predates the wake word and shares
`versionCode 6` with the 3.3 build, so it cannot be installed *over* 3.3.
Use **3.8** unless you are reproducing history.

## Signing

Every APK is signed with the standard Android **debug** keystore
(`CN=Android Debug`). That means:

- installs without any setup;
- Play Protect may show a warning for side-loaded apps;
- a build signed with a different key cannot update over these without uninstalling.

Generate a release keystore and point `signingConfigs.release` at it if you plan
to distribute updates.

## Verify a download

```bash
md5sum AmitAI-3.8.apk
# e7215eafd5bd7a2531d4fef3a5717f26  AmitAI-3.8.apk

sha256sum AmitAI-3.8.apk
# 200cadc63a55cb12ed3112bec40f55ac6f2f42a9b45f84d5ee208063ab8a0dbf  AmitAI-3.8.apk
```
