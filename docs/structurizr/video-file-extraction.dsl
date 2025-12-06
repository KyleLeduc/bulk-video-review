workspace "Bulk Video Reviewer - Video File Extraction" "Component-level (C3) view for AddVideosFromFilesUseCase pipeline" {
    !identifiers hierarchical

    model {
        reviewer = person "Reviewer" "Selects video files in the browser"
        system = softwareSystem "Bulk Video Reviewer" "Browser-based bulk video review tool" {
            webApp = container "Web Application" "Vue 3 SPA running in browser" "TypeScript" {
                videoStore = component "Video Store (Pinia)" "Dispatches addVideosFromFiles and holds UI state" "Pinia" {
                    tags "Presentation"
                }
                addVideosUseCase = component "AddVideosFromFilesUseCase" "Orchestrates video imports, reuses cached entries, persists metadata" {
                    tags "Application"
                }
                metadataPort = component "IVideoMetadataExtractor" "Port for turning uploaded files into parsed videos" {
                    tags "Port"
                }
                metadataExtractorAdapter = component "VideoMetadataExtractorAdapter" "Adapter implementation of metadata extraction" {
                    tags "Adapter"
                }
                domParser = component "VideoFileParser (DOM)" "Validates MIME, creates blob URLs, loads HTMLVideoElement, captures thumbnail" {
                    tags "InfraService"
                }
                hashGenerator = component "FileHashGenerator" "Generates deterministic video ids from file contents" {
                    tags "InfraService"
                }
                domVideoUtils = component "Video DOM Utilities" "loadVideoElement + captureThumbnail helpers" {
                    tags "BrowserApi"
                }
                aggregateRepoPort = component "IVideoAggregateRepository" "Port for reading/writing aggregate metadata" {
                    tags "Port"
                }
                aggregateRepo = component "VideoAggregateRepository" "Coordinates video + metadata persistence" {
                    tags "Adapter"
                }
                videoRepo = component "VideoRepository" "Stores video entities (title, thumbs, duration)" {
                    tags "Adapter"
                }
                metadataRepo = component "MetadataRepository" "Stores voting metadata" {
                    tags "Adapter"
                }
                databaseConnection = component "IndexedDB Connection" "Shared access to browser IndexedDB stores" {
                    tags "Database"
                }
                loggerPort = component "ILogger" "Port for logging timing + errors" {
                    tags "Port"
                }
                loggerAdapter = component "ConsoleLoggerAdapter" "Console-based logger" {
                    tags "Adapter"
                }
            }

            browserApis = container "Browser Platform APIs" "IndexedDB, URL.createObjectURL, HTMLVideoElement + canvas" "Browser" {
                tags "External"
            }
            idb = container "IndexedDB Storage" "Stores video + metadata aggregates" "Browser IndexedDB" {
                tags "Database"
            }
        }

        reviewer -> system.webApp.videoStore "Drops files into UI"
        system.webApp.videoStore -> system.webApp.addVideosUseCase "Requests addVideosFromFiles(files)"
        system.webApp.addVideosUseCase -> system.webApp.metadataPort "Generate ids + parse videos"
        system.webApp.metadataExtractorAdapter -> system.webApp.domParser "Transforms File into ParsedVideo"
        system.webApp.domParser -> system.webApp.hashGenerator "Hash file bytes"
        system.webApp.domParser -> system.webApp.domVideoUtils "Load video + capture thumb"
        system.webApp.domVideoUtils -> system.browserApis "Uses"

        system.webApp.metadataPort -> system.webApp.metadataExtractorAdapter "Implemented by"
        system.webApp.addVideosUseCase -> system.webApp.aggregateRepoPort "Get cached aggregates or persist new"
        system.webApp.aggregateRepoPort -> system.webApp.aggregateRepo "Implemented by"
        system.webApp.aggregateRepo -> system.webApp.videoRepo "Upsert video entities"
        system.webApp.aggregateRepo -> system.webApp.metadataRepo "Upsert metadata"
        system.webApp.videoRepo -> system.webApp.databaseConnection "Uses storeNames.video"
        system.webApp.metadataRepo -> system.webApp.databaseConnection "Uses storeNames.metadata"
        system.webApp.databaseConnection -> system.idb "IndexedDB connection"
        system.idb -> system.browserApis "Browser-managed storage APIs"

        system.webApp.addVideosUseCase -> system.webApp.loggerPort "Logs timing + failures"
        system.webApp.loggerPort -> system.webApp.loggerAdapter "Implemented by"
        system.webApp.loggerAdapter -> system.browserApis "Console output"
    }

    views {
        systemContext system "video-file-extraction-c1" {
            include *
            autolayout lr
            title "Video File Extraction Flow (C1)"
            description "System view starting at AddVideosFromFilesUseCase.ts"
        }

        container system "video-file-extraction-c2" {
            include system.webApp
            include system.browserApis
            include system.idb
            autolayout lr
            title "Video File Extraction Flow (C2)"
            description "Container view: SPA orchestrates imports, uses browser APIs and IndexedDB"
        }

        component system.webApp "video-file-extraction-c3" {
            include *
            autolayout lr
            title "Video File Extraction Flow (C3)"
            description "Component view starting at AddVideosFromFilesUseCase.ts"
        }

        styles {
            element "Person" {
                shape person
                background #f1f8ff
                color #0f3c61
            }
            element "Presentation" {
                background #e8f5e9
                color #1b5e20
            }
            element "Application" {
                background #fff3e0
                color #e65100
            }
            element "Port" {
                shape Hexagon
                background #ede7f6
                color #4527a0
            }
            element "Adapter" {
                background #e3f2fd
                color #0d47a1
            }
            element "InfraService" {
                background #fff8e1
                color #ef6c00
            }
            element "BrowserApi" {
                shape WebBrowser
                background #f5f5f5
                color #424242
            }
            element "Database" {
                shape Cylinder
                background #ede7e3
                color #5d4037
            }
            element "External" {
                background #eceff1
                color #37474f
                stroke #607d8b
                strokeWidth 2
            }
            relationship "Relationship" {
                thickness 3
            }
        }
    }
}
