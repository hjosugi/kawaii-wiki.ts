{
  description = "kawaii-wiki.ts development environment (Bun toolchain, pinned)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs =
    { self, nixpkgs }:
    let
      # Match the version pinned in package.json (packageManager / engines.bun).
      # nixpkgs ships a slightly older Bun, so we pin the official release
      # binary per system to keep local dev byte-for-byte with CI.
      bunVersion = "1.3.14";

      # `nix store prefetch-file` hashes for
      #   https://github.com/oven-sh/bun/releases/download/bun-v${bunVersion}/bun-<asset>.zip
      bunAssets = {
        "x86_64-linux" = {
          asset = "linux-x64";
          hash = "sha256-lR7iruhV8IWVruxiJSJqKY0/6oOj3NZGXAnLzN9+hI8=";
        };
        "aarch64-linux" = {
          asset = "linux-aarch64";
          hash = "sha256-on/7Y6gxA3WDbg1vZorhf6jY0YuIw3yCHGUzGXOhmjs=";
        };
        "aarch64-darwin" = {
          asset = "darwin-aarch64";
          hash = "sha256-2LliIYKK1vl6x6wKt+lYcjQa92MAHogD6CZ2UsJlJiA=";
        };
      };

      systems = builtins.attrNames bunAssets;
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          pin = bunAssets.${system};
          bun = pkgs.bun.overrideAttrs (old: {
            version = bunVersion;
            src = pkgs.fetchurl {
              url = "https://github.com/oven-sh/bun/releases/download/bun-v${bunVersion}/bun-${pin.asset}.zip";
              hash = pin.hash;
            };
          });
        in
        {
          default = pkgs.mkShell {
            packages = [
              bun
              pkgs.git
            ];
            shellHook = ''
              echo "kawaii-wiki.ts devshell — bun $(bun --version)"
            '';
          };
        }
      );
    };
}
